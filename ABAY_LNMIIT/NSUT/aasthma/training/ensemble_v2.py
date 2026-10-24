import os
import sys
import re
import json
import pickle
import warnings
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score

if sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

warnings.filterwarnings("ignore")

# ==============================================================================
# ENSEMBLE_v2 META-LEARNER TRAINING ON GPU (FROZEN BASE MODELS)
# ==============================================================================

def normalize_pid(pid: str) -> str:
    m = re.match(r"^PATIENT_(\d+)$", str(pid).strip())
    if m:
        return f"PATIENT_{int(m.group(1)):04d}"
    return str(pid).strip()

def find_dataset_base():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.abspath(os.path.join(current_dir, "..", "dataset", "data")),
        os.path.abspath(os.path.join(current_dir, "dataset", "data")),
        "dataset/data",
        "aasthma/dataset/data",
    ]
    for base in candidates:
        target = os.path.join(base, "dynamic2,0", "timeseries.tsv")
        if os.path.exists(target):
            return base
    raise FileNotFoundError("Could not locate dynamic2,0/timeseries.tsv in search candidates.")

INPUT_BASE = find_dataset_base()
AASTHMA_DIR = os.path.abspath(os.path.join(INPUT_BASE, "..", ".."))
TRAINING_DIR = os.path.join(AASTHMA_DIR, "training")

PATIENTS_PATH = os.path.join(INPUT_BASE, "static", "patients.csv")
HISTORY_PATH = os.path.join(INPUT_BASE, "static", "history_features.csv")
TIMESERIES_PATH = os.path.join(INPUT_BASE, "dynamic2,0", "timeseries.tsv")
EVENTS_PATH = os.path.join(INPUT_BASE, "labels", "events.csv")

TCN_DIR = os.path.join(TRAINING_DIR, "model1_v2")
GB_DIR = os.path.join(TRAINING_DIR, "model2_v2")

TCN_MODEL_PATH = os.path.join(TCN_DIR, "digital_twin_model_v2.pt")
TCN_CONFIG_PATH = os.path.join(TCN_DIR, "preprocessor_config_v2.pkl")
GB_MODEL_PATH = os.path.join(GB_DIR, "gb_digital_twin_models_v2.pkl")
GB_CONFIG_PATH = os.path.join(GB_DIR, "gb_preprocessor_config_v2.pkl")

META_MODEL_PATH = os.path.join(TRAINING_DIR, "meta_ensemble_model_v2.pt")
META_CONFIG_PATH = os.path.join(TRAINING_DIR, "meta_ensemble_config_v2.json")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"[+] Ensemble_v2 Execution Device: {device} | CUDA Available: {torch.cuda.is_available()}")
print(f"[OK] TCN_v2 Model Path:     {TCN_MODEL_PATH}")
print(f"[OK] XGBoost_v2 Model Path: {GB_MODEL_PATH}")
print(f"[OK] Meta Output Save Path: {META_MODEL_PATH}")

# ==============================================================================
# ARCHITECTURES
# ==============================================================================
class StaticMLPEncoder(nn.Module):
    def __init__(self, input_dim: int, output_dim: int = 64):
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
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)

class TCNBlock(nn.Module):
    def __init__(self, in_channels: int, out_channels: int, kernel_size: int = 3, dilation: int = 1, dropout: float = 0.2):
        super().__init__()
        padding = (kernel_size - 1) * dilation
        self.conv = nn.Conv1d(in_channels, out_channels, kernel_size, dilation=dilation, padding=padding)
        self.bn = nn.BatchNorm1d(out_channels)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.dropout(self.relu(self.bn(self.conv(x))))

class Conv1DDynamicEncoder(nn.Module):
    def __init__(self, in_channels: int, output_dim: int = 128):
        super().__init__()
        self.tcn_block1 = TCNBlock(in_channels, 32, kernel_size=3, dilation=1)
        self.tcn_block2 = TCNBlock(32, 64, kernel_size=3, dilation=2)
        self.tcn_block3 = TCNBlock(64, output_dim, kernel_size=3, dilation=4)
        self.global_pool = nn.AdaptiveAvgPool1d(1)
        self.post_pool = nn.Linear(output_dim, output_dim)
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.tcn_block1(x)
        x = self.tcn_block2(x)
        x = self.tcn_block3(x)
        x = self.global_pool(x).squeeze(-1)
        return self.post_pool(x)

class DigitalTwinFusionModel(nn.Module):
    def __init__(self, static_dim: int, dynamic_channels: int):
        super().__init__()
        self.static_dim = static_dim
        self.dynamic_channels = dynamic_channels
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

    def forward(self, static_x: torch.Tensor, dynamic_x: torch.Tensor):
        emb_static = self.static_encoder(static_x)
        emb_dynamic = self.dynamic_encoder(dynamic_x)
        fused = torch.cat((emb_static, emb_dynamic), dim=1)
        h = self.shared_head(fused)
        logit_24h = self.out_24h(h).squeeze(-1)
        logit_48h = self.out_48h(h).squeeze(-1)
        logits_sev = self.out_severity(h)
        return logit_24h, logit_48h, logits_sev

class RespiTwinMLPMetaLearner(nn.Module):
    """Combines 12D base model probabilities into final 24h, 48h and 4-class severity predictions."""
    def __init__(self, input_dim: int = 12, hidden_dim: int = 32):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.BatchNorm1d(hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, 16),
            nn.ReLU(),
        )
        self.head_24h = nn.Linear(16, 1)
        self.head_48h = nn.Linear(16, 1)
        self.head_sev = nn.Linear(16, 4)

    def forward(self, x_meta: torch.Tensor):
        hidden = self.net(x_meta)
        return (
            self.head_24h(hidden).squeeze(-1),
            self.head_48h(hidden).squeeze(-1),
            self.head_sev(hidden),
        )

# ==============================================================================
# FEATURE BUILDING HELPERS
# ==============================================================================
def build_xgb_features(static_vecs, raw_windows, gb_config):
    ts_num_cols = list(gb_config["ts_mean"].index)
    window_size = raw_windows.shape[1]
    num_dyn_feats = len(ts_num_cols)

    means = np.mean(raw_windows, axis=1)
    stds = np.std(raw_windows, axis=1)
    mins = np.min(raw_windows, axis=1)
    maxs = np.max(raw_windows, axis=1)
    deltas = raw_windows[:, -1, :] - raw_windows[:, 0, :]

    curr_idx = window_size - 1
    shift_indices = np.clip(curr_idx + np.array([-2, -1, 0, 1, 2]), 0, window_size - 1)
    shifts = raw_windows[:, shift_indices, :]

    dyn_extracted = []
    for f_idx in range(num_dyn_feats):
        dyn_extracted.extend([
            means[:, f_idx:f_idx+1],
            stds[:, f_idx:f_idx+1],
            mins[:, f_idx:f_idx+1],
            maxs[:, f_idx:f_idx+1],
            deltas[:, f_idx:f_idx+1],
            shifts[:, :, f_idx]
        ])

    dyn_mat = np.hstack(dyn_extracted)
    x_combined = np.hstack([static_vecs, dyn_mat]).astype(np.float32)
    return x_combined

def get_base_predictions(tcn_model, gb_models, static_norm, ts_norm, pids, event_map, tcn_config, gb_config, window_size=12):
    tcn_static_names = list(tcn_config["static_feature_names"])
    dynamic_names = list(tcn_config["ts_feature_names"])
    pid_to_static_idx = {pid: i for i, pid in enumerate(static_norm["patient_id"].values)}
    static_mat = static_norm[tcn_static_names].values.astype(np.float32)

    tcn_static_list = []
    tcn_dynamic_list = []
    xgb_static_list = []
    xgb_raw_windows_list = []
    y_24h_list, y_48h_list, y_sev_list = [], [], []

    ts_split = ts_norm[ts_norm["patient_id"].isin(pids)]
    for pid, group in ts_split.groupby("patient_id", sort=False):
        if pid not in pid_to_static_idx:
            continue
        p_static = static_mat[pid_to_static_idx[pid]]
        group_sorted = group.sort_values("timestamp_hour")
        features_matrix = group_sorted[dynamic_names].values.astype(np.float32)
        timestamps = group_sorted["timestamp_hour"].values
        p_events = event_map.get(pid, [])
        num_rows = len(group_sorted)
        if num_rows < window_size:
            continue

        for end_idx in range(window_size - 1, num_rows):
            start_idx = end_idx - (window_size - 1)
            current_hour = timestamps[end_idx]
            win_raw = features_matrix[start_idx : end_idx + 1]
            win_tcn = win_raw.T  # [Channels, Window]

            target_24h, target_48h, target_sev = 0.0, 0.0, 0
            for ev_start, ev_end, sev in p_events:
                if (current_hour < ev_start <= current_hour + 24) or (ev_start <= current_hour <= ev_end):
                    target_24h = 1.0
                    target_sev = max(target_sev, int(sev))
                if (current_hour < ev_start <= current_hour + 48) or (ev_start <= current_hour <= ev_end):
                    target_48h = 1.0
                    target_sev = max(target_sev, int(sev))

            tcn_static_list.append(p_static)
            tcn_dynamic_list.append(win_tcn)
            xgb_static_list.append(p_static)
            xgb_raw_windows_list.append(win_raw)
            y_24h_list.append(target_24h)
            y_48h_list.append(target_48h)
            y_sev_list.append(target_sev)

    # 1. TCN Predictions
    tcn_model.eval()
    tcn_static_arr = np.array(tcn_static_list, dtype=np.float32)
    tcn_dynamic_arr = np.array(tcn_dynamic_list, dtype=np.float32)

    tcn_24h_preds, tcn_48h_preds, tcn_sev_preds = [], [], []
    batch_size = 512
    with torch.no_grad():
        for start in range(0, len(tcn_static_arr), batch_size):
            end = start + batch_size
            b_s = torch.as_tensor(tcn_static_arr[start:end], dtype=torch.float32, device=device)
            b_d = torch.as_tensor(tcn_dynamic_arr[start:end], dtype=torch.float32, device=device)
            l24, l48, lsev = tcn_model(b_s, b_d)
            tcn_24h_preds.append(torch.sigmoid(l24).cpu().numpy())
            tcn_48h_preds.append(torch.sigmoid(l48).cpu().numpy())
            tcn_sev_preds.append(torch.softmax(lsev, dim=1).cpu().numpy())

    tcn_24h = np.concatenate(tcn_24h_preds)
    tcn_48h = np.concatenate(tcn_48h_preds)
    tcn_sev = np.concatenate(tcn_sev_preds)

    # 2. XGBoost Predictions
    xgb_features = build_xgb_features(np.array(xgb_static_list), np.array(xgb_raw_windows_list), gb_config)
    xgb_24h = gb_models["model_24h"].predict_proba(xgb_features)[:, 1]
    xgb_48h = gb_models["model_48h"].predict_proba(xgb_features)[:, 1]
    xgb_sev = gb_models["model_sev"].predict_proba(xgb_features)
    # Ensure 4 classes
    if xgb_sev.shape[1] < 4:
        padded = np.zeros((xgb_sev.shape[0], 4), dtype=np.float32)
        for col_idx, cls_id in enumerate(gb_models["model_sev"].classes_):
            padded[:, int(cls_id)] = xgb_sev[:, col_idx]
        xgb_sev = padded

    # Construct 12D Meta-Vector:
    # [tcn_24h, xgb_24h, tcn_48h, xgb_48h, tcn_sev(4), xgb_sev(4)]
    meta_x = np.column_stack([
        tcn_24h,
        xgb_24h,
        tcn_48h,
        xgb_48h,
        tcn_sev,
        xgb_sev
    ]).astype(np.float32)

    return meta_x, np.array(y_24h_list, dtype=np.float32), np.array(y_48h_list, dtype=np.float32), np.array(y_sev_list, dtype=np.int64)

# ==============================================================================
# MAIN PIPELINE
# ==============================================================================
def main():
    print("\n--- [STEP 1] LOADING CONFIGURATIONS & PRE-TRAINED v2 BASE MODELS ---")
    with open(TCN_CONFIG_PATH, "rb") as f:
        tcn_config = pickle.load(f)
    with open(GB_CONFIG_PATH, "rb") as f:
        gb_config = pickle.load(f)

    # Load TCN_v2
    tcn_model = DigitalTwinFusionModel(
        static_dim=tcn_config["static_dim"],
        dynamic_channels=tcn_config["dynamic_channels"]
    ).to(device)
    tcn_model.load_state_dict(torch.load(TCN_MODEL_PATH, map_location=device))
    tcn_model.eval()
    print(f"[*] Loaded TCN_v2 Model: static_dim={tcn_config['static_dim']}, dynamic_channels={tcn_config['dynamic_channels']}")

    # Load XGBoost_v2
    with open(GB_MODEL_PATH, "rb") as f:
        gb_models = pickle.load(f)
    print(f"[*] Loaded XGBoost_v2 Models: {list(gb_models.keys())}")

    # Load Raw Data
    patients_df = pd.read_csv(PATIENTS_PATH)
    history_df = pd.read_csv(HISTORY_PATH)
    ts_df = pd.read_csv(TIMESERIES_PATH, sep="\t")
    events_df = pd.read_csv(EVENTS_PATH)

    patients_df["patient_id"] = patients_df["patient_id"].apply(normalize_pid)
    history_df["patient_id"] = history_df["patient_id"].apply(normalize_pid)
    ts_df["patient_id"] = ts_df["patient_id"].apply(normalize_pid)
    events_df["patient_id"] = events_df["patient_id"].apply(normalize_pid)

    static_merged = pd.merge(patients_df, history_df, on="patient_id")
    common_pids = np.array(sorted(list(set(static_merged["patient_id"]).intersection(set(ts_df["patient_id"])))))

    # Splits
    np.random.seed(42)
    shuffled_pids = common_pids.copy()
    np.random.shuffle(shuffled_pids)
    n_total = len(shuffled_pids)
    n_train = int(0.80 * n_total)
    n_val = int(0.10 * n_total)

    train_pids = shuffled_pids[:n_train]
    val_pids = shuffled_pids[n_train:n_train + n_val]
    test_pids = shuffled_pids[n_train + n_val:]

    # Normalization using saved v2 configs
    static_cohort = static_merged[static_merged["patient_id"].isin(common_pids)].copy()
    static_ids = static_cohort[["patient_id"]]
    static_encoded = pd.get_dummies(static_cohort.drop(columns=["patient_id"]))
    static_norm = (static_encoded - tcn_config["static_mean"]) / tcn_config["static_std"]
    static_norm["patient_id"] = static_ids["patient_id"]

    ts_num_cols = tcn_config["ts_feature_names"]
    ts_norm = ts_df.copy()
    ts_norm[ts_num_cols] = (ts_norm[ts_num_cols] - tcn_config["ts_mean"]) / tcn_config["ts_std"]

    # Events map
    event_map = {}
    for _, row in events_df.iterrows():
        pid = row["patient_id"]
        start_h = int(row["event_time_hour"])
        duration = int(row.get("duration_hours", 18))
        sev = int(row["severity_score"])
        if pid not in event_map:
            event_map[pid] = []
        event_map[pid].append((start_h, start_h + duration, sev))

    print("\n--- [STEP 2] EXTRACTING 12D META-FEATURE VECTORS FROM BASE MODELS ---")
    print("Generating validation meta-features (for meta-learner training)...")
    val_meta_x, val_y24, val_y48, val_ysev = get_base_predictions(
        tcn_model, gb_models, static_norm, ts_norm, val_pids, event_map, tcn_config, gb_config
    )
    print(f"[*] Validation Meta-Features Dimension: {val_meta_x.shape}")

    print("Generating train meta-features (optional auxiliary pool)...")
    train_meta_x, train_y24, train_y48, train_ysev = get_base_predictions(
        tcn_model, gb_models, static_norm, ts_norm, train_pids, event_map, tcn_config, gb_config
    )

    print("Generating test meta-features (for final benchmark evaluation)...")
    test_meta_x, test_y24, test_y48, test_ysev = get_base_predictions(
        tcn_model, gb_models, static_norm, ts_norm, test_pids, event_map, tcn_config, gb_config
    )

    print("\n--- [STEP 3] INITIALIZING META-LEARNER_v2 ON GPU ---")
    meta_model = RespiTwinMLPMetaLearner(input_dim=12, hidden_dim=32).to(device)
    optimizer = torch.optim.AdamW(meta_model.parameters(), lr=1e-3, weight_decay=1e-4)
    criterion_bce = nn.BCEWithLogitsLoss()
    criterion_ce = nn.CrossEntropyLoss()

    # Create Tensor dataset for meta-training
    # Combine val (and train subset if desired) to train the stacking MLP
    meta_train_x = torch.as_tensor(val_meta_x, dtype=torch.float32, device=device)
    meta_train_y24 = torch.as_tensor(val_y24, dtype=torch.float32, device=device)
    meta_train_y48 = torch.as_tensor(val_y48, dtype=torch.float32, device=device)
    meta_train_ysev = torch.as_tensor(val_ysev, dtype=torch.long, device=device)

    print("\n--- [STEP 4] TRAINING META-LEARNER_v2 (20 EPOCHS, PURE FROZEN PASS) ---")
    EPOCHS = 20
    meta_model.train()
    for epoch in range(EPOCHS):
        optimizer.zero_grad()
        out24, out48, outsev = meta_model(meta_train_x)
        loss24 = criterion_bce(out24, meta_train_y24)
        loss48 = criterion_bce(out48, meta_train_y48)
        losssev = criterion_ce(outsev, meta_train_ysev)
        loss = loss24 + 0.5 * loss48 + 0.5 * losssev
        loss.backward()
        optimizer.step()

        if (epoch + 1) % 5 == 0 or epoch == 0:
            preds24 = (torch.sigmoid(out24) > 0.5).float()
            acc24 = (preds24 == meta_train_y24).float().mean().item() * 100
            print(f"Epoch {epoch+1:02d}/{EPOCHS:02d} | Stacking Loss: {loss.item():.4f} | 24h Meta Acc: {acc24:.2f}%")

    print("\n--- [STEP 5] EVALUATING META-LEARNER_v2 ON TEST SET ---")
    meta_model.eval()
    with torch.no_grad():
        test_x_tensor = torch.as_tensor(test_meta_x, dtype=torch.float32, device=device)
        test_out24, test_out48, test_outsev = meta_model(test_x_tensor)
        probs_24h = torch.sigmoid(test_out24).cpu().numpy()
        probs_48h = torch.sigmoid(test_out48).cpu().numpy()
        preds_sev = torch.argmax(test_outsev, dim=1).cpu().numpy()

    auc_24h = roc_auc_score(test_y24, probs_24h) if len(np.unique(test_y24)) > 1 else 0.5
    f1_24h = f1_score(test_y24, probs_24h > 0.5, zero_division=0)
    auc_48h = roc_auc_score(test_y48, probs_48h) if len(np.unique(test_y48)) > 1 else 0.5
    f1_sev = f1_score(test_ysev, preds_sev, average="weighted", zero_division=0)

    print("=" * 60)
    print("             META-LEARNER_v2 TEST METRICS            ")
    print("=" * 60)
    print(f"24h Stacking Horizon ROC-AUC: {auc_24h:.4f} | F1-Score: {f1_24h:.4f}")
    print(f"48h Stacking Horizon ROC-AUC: {auc_48h:.4f}")
    print(f"Severity Stacking F1-Score:   {f1_sev:.4f}")
    print("=" * 60)

    print("\n--- [STEP 6] SAVING META-LEARNER_v2 ARTIFACTS ---")
    torch.save(meta_model.state_dict(), META_MODEL_PATH)
    print(f"[+] Saved Meta-Learner_v2 weights to: {META_MODEL_PATH}")

    meta_config = {
        "model_version": "v2.0.0-frozen",
        "input_features": [
            "tcn_risk_24h",
            "xgboost_risk_24h",
            "tcn_risk_48h",
            "xgboost_risk_48h",
            "tcn_severity_0",
            "tcn_severity_1",
            "tcn_severity_2",
            "tcn_severity_3",
            "xgboost_severity_0",
            "xgboost_severity_1",
            "xgboost_severity_2",
            "xgboost_severity_3",
        ],
        "input_dim": 12,
        "hidden_dim": 32,
        "epochs": EPOCHS,
        "retraining_disabled": True,
        "metrics": {
            "test_roc_auc_24h": round(float(auc_24h), 4),
            "test_f1_24h": round(float(f1_24h), 4),
            "test_roc_auc_48h": round(float(auc_48h), 4),
            "test_severity_f1": round(float(f1_sev), 4)
        }
    }
    with open(META_CONFIG_PATH, "w") as f:
        json.dump(meta_config, f, indent=2)
    print(f"[+] Saved Meta-Learner_v2 configuration to: {META_CONFIG_PATH}")
    print("[OK] Ensemble_v2 Training Finished Successfully!")

if __name__ == "__main__":
    main()
