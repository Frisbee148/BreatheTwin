import os
import pickle
import warnings
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F

warnings.filterwarnings("ignore")

# ==========================================
# 1. DYNAMIC PATH DISCOVERY & CONFIGURATION
# ==========================================
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
AASTHMA_DIR = os.path.dirname(CURRENT_DIR)
TRAINING_DIR = os.path.join(AASTHMA_DIR, "training")

TCN_MODEL_PATH = os.path.join(TRAINING_DIR, "model1", "digital_twin_model.pt")
TCN_CONFIG_PATH = os.path.join(TRAINING_DIR, "model1", "preprocessor_config.pkl")
GB_MODEL_PATH = os.path.join(TRAINING_DIR, "model2", "gb_digital_twin_models.pkl")
GB_CONFIG_PATH = os.path.join(TRAINING_DIR, "model2", "gb_preprocessor_config.pkl")
META_MODEL_PATH = os.path.join(TRAINING_DIR, "meta_ensemble_model.pt")
OUTPUT_DIR = TRAINING_DIR

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ==========================================
# 2. MODEL ARCHITECTURES FOR RELOADING
# ==========================================
class TCNBlock(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size=3, dilation=1, dropout=0.2):
        super().__init__()
        padding = (kernel_size - 1) * dilation
        self.conv = nn.Conv1d(in_channels, out_channels, kernel_size, dilation=dilation, padding=padding)
        self.bn = nn.BatchNorm1d(out_channels)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)
        
    def forward(self, x):
        return self.dropout(self.relu(self.bn(self.conv(x))))

class Conv1DDynamicEncoder(nn.Module):
    def __init__(self, in_channels=5, output_dim=128):
        super().__init__()
        self.tcn_block1 = TCNBlock(in_channels, 32, kernel_size=3, dilation=1)
        self.tcn_block2 = TCNBlock(32, 64, kernel_size=3, dilation=2)
        self.tcn_block3 = TCNBlock(64, output_dim, kernel_size=3, dilation=4)
        self.global_pool = nn.AdaptiveAvgPool1d(1)
        self.post_pool = nn.Linear(output_dim, output_dim)
        
    def forward(self, x):
        x = self.tcn_block3(self.tcn_block2(self.tcn_block1(x)))
        return self.post_pool(self.global_pool(x).squeeze(-1))

class StaticMLPEncoder(nn.Module):
    def __init__(self, input_dim, output_dim=64):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, output_dim),
            nn.BatchNorm1d(output_dim),
            nn.ReLU()
        )
    def forward(self, x):
        return self.net(x)

# STAGE 1: PyTorch TCN Neural Base Model
class DigitalTwinFusionModel(nn.Module):
    def __init__(self, static_dim, dynamic_channels=5):
        super().__init__()
        self.static_encoder = StaticMLPEncoder(input_dim=static_dim, output_dim=64)
        self.dynamic_encoder = Conv1DDynamicEncoder(in_channels=dynamic_channels, output_dim=128)
        self.shared_head = nn.Sequential(
            nn.Linear(64 + 128, 64),
            nn.ReLU(),
            nn.Dropout(0.3)
        )
        self.out_24h = nn.Linear(64, 1)
        self.out_48h = nn.Linear(64, 1)
        self.out_severity = nn.Linear(64, 4)

    def forward(self, static_x, dynamic_x):
        fused = torch.cat((self.static_encoder(static_x), self.dynamic_encoder(dynamic_x)), dim=1)
        h = self.shared_head(fused)
        return self.out_24h(h).squeeze(-1), self.out_48h(h).squeeze(-1), self.out_severity(h)

# STAGE 2: MLP Stacking Meta-Learner
class RespiTwinMLPMetaLearner(nn.Module):
    def __init__(self, input_dim=12, hidden_dim=32):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.BatchNorm1d(hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, 16),
            nn.ReLU()
        )
        self.head_24h = nn.Linear(16, 1)
        self.head_48h = nn.Linear(16, 1)
        self.head_sev = nn.Linear(16, 4)

    def forward(self, x_meta):
        h = self.net(x_meta)
        out_24h = self.head_24h(h).squeeze(-1)
        out_48h = self.head_48h(h).squeeze(-1)
        out_sev = self.head_sev(h)
        return out_24h, out_48h, out_sev

# ==========================================
# 3. UNIFIED INFERENCE ENGINE CLASS
# ==========================================
class RespiTwinInferenceEngine:
    def __init__(self, target_window_size=12):
        self.target_window_size = target_window_size
        print(f"⏳ Reloading Stage-1 and Stage-2 model artifacts from: {OUTPUT_DIR}")
        
        # 1. Load PyTorch TCN Config & Model
        with open(TCN_CONFIG_PATH, "rb") as f:
            self.tcn_config = pickle.load(f)
            
        self.tcn_model = DigitalTwinFusionModel(
            static_dim=self.tcn_config["static_dim"],
            dynamic_channels=self.tcn_config["dynamic_channels"]
        )
        self.tcn_model.load_state_dict(torch.load(TCN_MODEL_PATH, map_location=device))
        self.tcn_model.to(device)
        self.tcn_model.eval()
        
        # 2. Load Gradient Boosting Models & Config
        with open(GB_MODEL_PATH, "rb") as f:
            gb_artifacts = pickle.load(f)
            self.gb_24h = gb_artifacts["model_24h"]
            self.gb_48h = gb_artifacts["model_48h"]
            self.gb_sev = gb_artifacts["model_sev"]
            
        with open(GB_CONFIG_PATH, "rb") as f:
            self.gb_config = pickle.load(f)

        # 3. Load Stage-2 MLP Meta-Learner
        self.meta_model = RespiTwinMLPMetaLearner(input_dim=12).to(device)
        self.meta_model.load_state_dict(torch.load(META_MODEL_PATH, map_location=device))
        self.meta_model.eval()
            
        print("✅ Pipeline Loaded: Stage-1 (TCN + XGBoost) & Stage-2 (MLP Meta-Learner) Ready!")

    def predict(self, raw_static_vec, raw_dynamic_matrix, mode="last_24h"):
        """
        Executes end-to-end stacked inference for a single patient record.
        
        Args:
            raw_static_vec: Unscaled numpy array [Static_Features]
            raw_dynamic_matrix: Unscaled numpy array [Channels, Time_Hours]
            mode: "last_24h" (Slices recent 24-hour window) or "full_history"
        """
        C, T = raw_dynamic_matrix.shape
        
        # Horizon Slicing
        if mode == "last_24h":
            selected_dyn = raw_dynamic_matrix[:, -24:] if T >= 24 else raw_dynamic_matrix
        else:
            selected_dyn = raw_dynamic_matrix

        # --- A. STAGE 1: PYTORCH TCN BASE INFERENCE ---
        norm_static = (raw_static_vec - self.tcn_config["static_mean"].values) / self.tcn_config["static_std"].values
        t_static = torch.tensor(norm_static, dtype=torch.float32).unsqueeze(0).to(device)
        
        norm_dynamic = (selected_dyn.T - self.tcn_config["ts_mean"].values) / self.tcn_config["ts_std"].values
        t_dynamic = torch.tensor(norm_dynamic.T, dtype=torch.float32).unsqueeze(0).to(device)
        
        # Left-padding for short sequences
        curr_len = t_dynamic.shape[2]
        if curr_len < self.target_window_size:
            pad_size = self.target_window_size - curr_len
            t_dynamic = F.pad(t_dynamic, (pad_size, 0), mode='constant', value=0.0)

        with torch.no_grad():
            logit_24h_tcn, logit_48h_tcn, logits_sev_tcn = self.tcn_model(t_static, t_dynamic)
            p24_tcn = torch.sigmoid(logit_24h_tcn).cpu().numpy().flatten()[0]
            p48_tcn = torch.sigmoid(logit_48h_tcn).cpu().numpy().flatten()[0]
            psev_tcn = torch.softmax(logits_sev_tcn, dim=1).cpu().numpy().flatten()

        # --- B. STAGE 1: GRADIENT BOOSTING BASE INFERENCE ---
        means = np.mean(selected_dyn, axis=1)
        stds = np.std(selected_dyn, axis=1)
        mins = np.min(selected_dyn, axis=1)
        maxs = np.max(selected_dyn, axis=1)
        deltas = selected_dyn[:, -1] - selected_dyn[:, 0]
        
        curr_idx = selected_dyn.shape[1] - 1
        shift_indices = np.clip(curr_idx + np.array([-2, -1, 0, 1, 2]), 0, curr_idx)
        shifts = selected_dyn[:, shift_indices]
        
        dyn_extracted = []
        for f_idx in range(C):
            dyn_extracted.extend([
                [means[f_idx]], [stds[f_idx]],
                [mins[f_idx]], [maxs[f_idx]],
                [deltas[f_idx]], shifts[f_idx, :]
            ])
            
        dyn_tab = np.hstack(dyn_extracted).flatten()
        gb_input = np.hstack([norm_static, dyn_tab]).reshape(1, -1)
        
        p24_xgb = float(self.gb_24h.predict_proba(gb_input)[:, 1][0])
        p48_xgb = float(self.gb_48h.predict_proba(gb_input)[:, 1][0])
        
        raw_sev_xgb = self.gb_sev.predict_proba(gb_input)[0]
        psev_xgb = np.zeros(4)
        psev_xgb[:len(raw_sev_xgb)] = raw_sev_xgb

        # --- C. STAGE 2: META-LEARNER STACKED FUSION ---
        x_meta = np.hstack([
            [p24_tcn], [p24_xgb],
            [p48_tcn], [p48_xgb],
            psev_tcn, psev_xgb
        ]).reshape(1, -1)

        t_meta = torch.tensor(x_meta, dtype=torch.float32).to(device)
        with torch.no_grad():
            logit_24h_meta, logit_48h_meta, logits_sev_meta = self.meta_model(t_meta)
            
            final_p24 = torch.sigmoid(logit_24h_meta).cpu().numpy().flatten()[0]
            final_p48 = torch.sigmoid(logit_48h_meta).cpu().numpy().flatten()[0]
            final_probs_sev = torch.softmax(logits_sev_meta, dim=1).cpu().numpy().flatten()
            final_sev_class = int(np.argmax(final_probs_sev))

        return {
            "mode_used": mode,
            "sequence_hours_processed": selected_dyn.shape[1],
            "final_predictions": {
                "p24_attack_risk": round(float(final_p24), 4),
                "p48_exacerbation_risk": round(float(final_p48), 4),
                "predicted_severity_grade": final_sev_class,
                "severity_class_probabilities": [round(float(p), 4) for p in final_probs_sev]
            },
            "stage1_model_breakdown": {
                "tcn_24h": round(float(p24_tcn), 4),
                "xgb_24h": round(float(p24_xgb), 4),
                "tcn_48h": round(float(p48_tcn), 4),
                "xgb_48h": round(float(p48_xgb), 4)
            }
        }

# ==========================================
# 4. VERIFICATION TEST RUN
# ==========================================
if __name__ == "__main__":
    engine = RespiTwinInferenceEngine(target_window_size=12)
    
    # Generate mock patient sample matching loaded channel configuration
    static_dim = engine.tcn_config["static_dim"]
    dynamic_channels = engine.tcn_config["dynamic_channels"]
    
    dummy_static = np.zeros(static_dim)
    dummy_dynamic = np.random.randn(dynamic_channels, 240)  # 240-hour telemetry sequence
    
    output = engine.predict(dummy_static, dummy_dynamic, mode="last_24h")
    
    print("\n" + "="*70)
    print("      RESPITWIN STACKED ENSEMBLE LIVE INFERENCE OUTPUT      ")
    print("="*70)
    print(f"📍 Horizon Mode:                   {output['mode_used']} ({output['sequence_hours_processed']} hrs)")
    print(f"🚨 Final 24h Attack Risk:          {output['final_predictions']['p24_attack_risk'] * 100:.1f}%")
    print(f"⚠️  Final 48h Exacerbation Risk:    {output['final_predictions']['p48_exacerbation_risk'] * 100:.1f}%")
    print(f"🏥 Final Severity Grade:            Grade {output['final_predictions']['predicted_severity_grade']}")
    print("-" * 70)
    print("📊 Stage-1 Base Model Scores:")
    print(f"   ├─ PyTorch TCN  (24h: {output['stage1_model_breakdown']['tcn_24h']:.4f} | 48h: {output['stage1_model_breakdown']['tcn_48h']:.4f})")
    print(f"   └─ XGBoost Tree (24h: {output['stage1_model_breakdown']['xgb_24h']:.4f} | 48h: {output['stage1_model_breakdown']['xgb_48h']:.4f})")
    print("="*70)