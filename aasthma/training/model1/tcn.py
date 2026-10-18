import os
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import pandas as pd
import numpy as np
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score
import warnings
import pickle

warnings.filterwarnings("ignore")

# ==========================================
# TCN MODEL FOR ASTHMA EXACERBATION PREDICTION
# ==========================================
# DYNAMIC CHANNELS INGESTED:
#   1. hourly_cough_count: Acoustic biosensor cough detection (count/hour)
#   2. wheeze_percent_duration: % of breathing cycles with wheeze (400-1600 Hz)
#   3. respiratory_rate_brpm: Respiration rate (breaths/min)
#   4. heart_rate_bpm: Heart rate (beats/min)
#   5. hrv_rmssd_ms: Heart Rate Variability - RMSSD metric (milliseconds)
#   + Any existing telemetry channels present in timeseries.tsv
# ==========================================

# Enable TensorFloat-32 (TF32) for fast matrix multiplication on Ampere GPUs
if torch.cuda.is_available():
    torch.set_float32_matmul_precision('high')

# ==========================================
# 1. DYNAMIC FILE DISCOVERY
# ==========================================
def find_dataset_base():
    local_data = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dataset", "data"))
    candidates = [
        local_data,
        "aasthma/dataset/data",
        "/kaggle/input/aasthma2",
        "/kaggle/input/aasthma",
        "/kaggle/input/aasthma/data",
        "/kaggle/input/aasthma2/data",
        "/kaggle/working/data",
        "/kaggle/working",
        "data"
    ]
    
    for base in candidates:
        target = os.path.join(base, "static", "patients.csv")
        if os.path.exists(target):
            return base
            
    for root, dirs, files in os.walk("/kaggle"):
        if "patients.csv" in files:
            return os.path.dirname(root)
            
    return None

INPUT_BASE = find_dataset_base()

if INPUT_BASE is None:
    raise FileNotFoundError("Could not locate patients.csv anywhere in search directories.")

PATIENTS_PATH = os.path.join(INPUT_BASE, "static", "patients.csv")
HISTORY_PATH = os.path.join(INPUT_BASE, "static", "history_features.csv")
TIMESERIES_PATH = os.path.join(INPUT_BASE, "dynamic", "timeseries.tsv")
EVENTS_PATH = os.path.join(INPUT_BASE, "labels", "events.csv")

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUTPUT_DIR, exist_ok=True)

MODEL_SAVE_PATH = os.path.join(OUTPUT_DIR, "digital_twin_model.pt")
CONFIG_SAVE_PATH = os.path.join(OUTPUT_DIR, "preprocessor_config.pkl")

print(f"✅ Verified Active Dataset Directory: {INPUT_BASE}")
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
num_gpus = torch.cuda.device_count()
print(f"Running on Device: {device} | Total GPUs Available: {num_gpus}")

# ==========================================
# 2. FAST VECTORIZED WINDOW DATASET
# ==========================================
class FastDigitalTwinDataset(Dataset):
    def __init__(self, patient_ids, static_df, ts_df, event_map, static_mean=None, static_std=None, window_size=12):
        self.window_size = window_size
        
        # Static Preprocessing
        split_static = static_df[static_df["patient_id"].isin(patient_ids)].copy()
        static_encoded = pd.get_dummies(split_static.drop(columns=["patient_id"]))
        self.feature_names = static_encoded.columns.tolist()
        
        if static_mean is None or static_std is None:
            self.static_mean = static_encoded.mean()
            self.static_std = static_encoded.std() + 1e-8
        else:
            self.static_mean = static_mean
            self.static_std = static_std

        norm_static = ((static_encoded - self.static_mean) / self.static_std).values.astype(np.float32)
        pid_to_static_idx = {pid: i for i, pid in enumerate(split_static["patient_id"].values)}
        
        ts_num_cols = ts_df.columns.difference(["patient_id", "timestamp_hour"])
        
        static_list = []
        dynamic_list = []
        target_24h_list = []
        target_48h_list = []
        target_sev_list = []

        # Vectorized Pre-computation Loop
        grouped = ts_df[ts_df["patient_id"].isin(patient_ids)].groupby("patient_id")
        
        for pid, group in grouped:
            if pid not in pid_to_static_idx:
                continue
            
            p_static_vec = norm_static[pid_to_static_idx[pid]]
            group_sorted = group.sort_values("timestamp_hour")
            features_matrix = group_sorted[ts_num_cols].values.astype(np.float32)
            timestamps = group_sorted["timestamp_hour"].values
            p_events = event_map.get(pid, [])
            
            num_rows = len(group_sorted)
            if num_rows < window_size:
                continue
                
            # Efficient sliding window pre-slicing
            for end_idx in range(window_size - 1, num_rows):
                start_idx = end_idx - (window_size - 1)
                current_hour = timestamps[end_idx]
                
                window_mat = features_matrix[start_idx : end_idx + 1].T  # [Channels, Window_Size]
                
                target_24h, target_48h, target_sev = 0.0, 0.0, 0
                for ev_start, ev_end, sev in p_events:
                    if current_hour < ev_start <= current_hour + 24 or (ev_start <= current_hour <= ev_end):
                        target_24h = 1.0
                        target_sev = max(target_sev, sev)
                    if current_hour < ev_start <= current_hour + 48 or (ev_start <= current_hour <= ev_end):
                        target_48h = 1.0
                        target_sev = max(target_sev, sev)
                
                static_list.append(p_static_vec)
                dynamic_list.append(window_mat)
                target_24h_list.append(target_24h)
                target_48h_list.append(target_48h)
                target_sev_list.append(target_sev)

        # Convert entire dataset into contiguous PyTorch Tensors in RAM
        self.static_data = torch.tensor(np.array(static_list), dtype=torch.float32)
        self.dynamic_data = torch.tensor(np.array(dynamic_list), dtype=torch.float32)
        self.target_24h = torch.tensor(np.array(target_24h_list), dtype=torch.float32)
        self.target_48h = torch.tensor(np.array(target_48h_list), dtype=torch.float32)
        self.target_sev = torch.tensor(np.array(target_sev_list), dtype=torch.long)

    def __len__(self):
        return len(self.static_data)

    def __getitem__(self, idx):
        return (
            self.static_data[idx], 
            self.dynamic_data[idx], 
            self.target_24h[idx],
            self.target_48h[idx],
            self.target_sev[idx]
        )

# ==========================================
# 3. MULTIMODAL MODEL ARCHITECTURE
# ==========================================
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

class TCNBlock(nn.Module):
    """Temporal Convolutional Block with dilated convolutions for multi-scale temporal receptive fields"""
    def __init__(self, in_channels, out_channels, kernel_size=3, dilation=1, dropout=0.2):
        super().__init__()
        padding = (kernel_size - 1) * dilation
        self.conv = nn.Conv1d(in_channels, out_channels, kernel_size, dilation=dilation, padding=padding)
        self.bn = nn.BatchNorm1d(out_channels)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x):
        x = self.conv(x)
        x = self.bn(x)
        x = self.relu(x)
        x = self.dropout(x)
        return x

class Conv1DDynamicEncoder(nn.Module):
    def __init__(self, in_channels=5, output_dim=128):
        super().__init__()
        # Multi-scale TCN with progressive channel expansion
        self.tcn_block1 = TCNBlock(in_channels, 32, kernel_size=3, dilation=1)
        self.tcn_block2 = TCNBlock(32, 64, kernel_size=3, dilation=2)
        self.tcn_block3 = TCNBlock(64, output_dim, kernel_size=3, dilation=4)
        
        self.global_pool = nn.AdaptiveAvgPool1d(1)
        self.post_pool = nn.Linear(output_dim, output_dim)
        
    def forward(self, x):
        x = self.tcn_block1(x)
        x = self.tcn_block2(x)
        x = self.tcn_block3(x)
        
        x = self.global_pool(x).squeeze(-1)
        x = self.post_pool(x)
        return x

class DigitalTwinFusionModel(nn.Module):
    def __init__(self, static_dim, dynamic_channels=5):
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

    def forward(self, static_x, dynamic_x):
        emb_static = self.static_encoder(static_x)
        emb_dynamic = self.dynamic_encoder(dynamic_x)
        fused_192d = torch.cat((emb_static, emb_dynamic), dim=1)
        
        h = self.shared_head(fused_192d)
        logit_24h = self.out_24h(h).squeeze(-1)
        logit_48h = self.out_48h(h).squeeze(-1)
        logits_sev = self.out_severity(h)
        
        return logit_24h, logit_48h, logits_sev

# ==========================================
# 4. PREPARE DATA SPLITS
# ==========================================
print("Loading raw CSV/TSV files...")
patients_df = pd.read_csv(PATIENTS_PATH)
history_df = pd.read_csv(HISTORY_PATH)
ts_df = pd.read_csv(TIMESERIES_PATH, sep="\t")
events_df = pd.read_csv(EVENTS_PATH)

static_merged = pd.merge(patients_df, history_df, on="patient_id")
ts_num_cols = ts_df.columns.difference(["patient_id", "timestamp_hour"])

print(f"📊 Extracted Dynamic Telemetry Features ({len(ts_num_cols)} channels):")
print("   " + ", ".join(ts_num_cols.tolist()))

all_pids = np.unique(static_merged["patient_id"].values)
np.random.seed(42)
np.random.shuffle(all_pids)

n_total = len(all_pids)
n_train = int(0.80 * n_total)
n_val = int(0.10 * n_total)

train_pids = all_pids[:n_train]
val_pids = all_pids[n_train:n_train + n_val]
test_pids = all_pids[n_train + n_val:]

# Training split normalization stats
ts_train_mask = ts_df["patient_id"].isin(train_pids)
ts_mean = ts_df.loc[ts_train_mask, ts_num_cols].mean()
ts_std = ts_df.loc[ts_train_mask, ts_num_cols].std() + 1e-8

ts_df[ts_num_cols] = (ts_df[ts_num_cols] - ts_mean) / ts_std

event_map = {}
for _, row in events_df.iterrows():
    pid = row["patient_id"]
    start_h = int(row["event_time_hour"])
    duration = int(row.get("duration_hours", 18))
    sev = int(row["severity_score"])
    if pid not in event_map:
        event_map[pid] = []
    event_map[pid].append((start_h, start_h + duration, sev))

print("Pre-computing dynamic windows into contiguous tensors...")
train_dataset = FastDigitalTwinDataset(train_pids, static_merged, ts_df, event_map)
val_dataset = FastDigitalTwinDataset(val_pids, static_merged, ts_df, event_map, static_mean=train_dataset.static_mean, static_std=train_dataset.static_std)
test_dataset = FastDigitalTwinDataset(test_pids, static_merged, ts_df, event_map, static_mean=train_dataset.static_mean, static_std=train_dataset.static_std)

train_loader = DataLoader(train_dataset, batch_size=256, shuffle=True, num_workers=2, pin_memory=True if device.type=='cuda' else False)
val_loader = DataLoader(val_dataset, batch_size=256, shuffle=False, num_workers=2, pin_memory=True if device.type=='cuda' else False)
test_loader = DataLoader(test_dataset, batch_size=256, shuffle=False, num_workers=2, pin_memory=True if device.type=='cuda' else False)

static_input_dim = train_dataset.static_data.shape[1]
dynamic_channels = len(ts_num_cols)

model = DigitalTwinFusionModel(static_dim=static_input_dim, dynamic_channels=dynamic_channels)

if num_gpus > 1:
    print(f"Wrapping model across {num_gpus} GPUs using DataParallel...")
    model = nn.DataParallel(model)

model = model.to(device)

criterion_bce = nn.BCEWithLogitsLoss()
criterion_ce = nn.CrossEntropyLoss()
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)

# Automatic Mixed Precision (AMP) Scaler
scaler = torch.cuda.amp.GradScaler(enabled=(device.type == 'cuda'))

# ==========================================
# 5. FAST TRAINING & EVALUATION LOOP
# ==========================================
def run_epoch(dataloader, is_train=True):
    if is_train:
        model.train()
    else:
        model.eval()
        
    total_loss = 0.0
    correct_24h = 0
    total_samples = 0
    
    with torch.set_grad_enabled(is_train):
        for static_x, dynamic_x, target_24h, target_48h, target_sev in dataloader:
            static_x = static_x.to(device, non_blocking=True)
            dynamic_x = dynamic_x.to(device, non_blocking=True)
            target_24h = target_24h.to(device, non_blocking=True)
            target_48h = target_48h.to(device, non_blocking=True)
            target_sev = target_sev.to(device, non_blocking=True)
            
            optimizer.zero_grad(set_to_none=True)
            
            with torch.cuda.amp.autocast(enabled=(device.type == 'cuda')):
                logit_24h, logit_48h, logits_sev = model(static_x, dynamic_x)
                
                loss_24h = criterion_bce(logit_24h, target_24h)
                loss_48h = criterion_bce(logit_48h, target_48h)
                loss_sev = criterion_ce(logits_sev, target_sev)
                
                loss = loss_24h + (0.5 * loss_48h) + (0.5 * loss_sev)
            
            if is_train:
                scaler.scale(loss).backward()
                scaler.unscale_(optimizer)
                nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                scaler.step(optimizer)
                scaler.update()
                
            total_loss += loss.item() * static_x.size(0)
            preds_24h = (torch.sigmoid(logit_24h) > 0.5).float()
            correct_24h += (preds_24h == target_24h).sum().item()
            total_samples += static_x.size(0)
            
    return total_loss / total_samples, (correct_24h / total_samples) * 100

print("\nStarting Fast Training Execution...")
EPOCHS = 10

for epoch in range(EPOCHS):
    train_loss, train_acc = run_epoch(train_loader, is_train=True)
    val_loss, val_acc = run_epoch(val_loader, is_train=False)
    
    print(f"Epoch {epoch+1:02d}/{EPOCHS:02d} | "
          f"Train Loss: {train_loss:.4f} | Train Acc (24h): {train_acc:.2f}% | "
          f"Val Loss: {val_loss:.4f} | Val Acc (24h): {val_acc:.2f}%")

# ==========================================
# 6. TEST BENCHMARK
# ==========================================
print("\n--- RUNNING TEST SET BENCHMARK EVALUATION ---")
model.eval()

all_targets_24h, all_probs_24h = [], []
all_targets_48h, all_probs_48h = [], []
all_targets_sev, all_preds_sev = [], []

with torch.no_grad():
    for static_x, dynamic_x, target_24h, target_48h, target_sev in test_loader:
        static_x = static_x.to(device, non_blocking=True)
        dynamic_x = dynamic_x.to(device, non_blocking=True)
        
        with torch.cuda.amp.autocast(enabled=(device.type == 'cuda')):
            logit_24h, logit_48h, logits_sev = model(static_x, dynamic_x)
        
        all_probs_24h.extend(torch.sigmoid(logit_24h).cpu().numpy())
        all_targets_24h.extend(target_24h.numpy())
        
        all_probs_48h.extend(torch.sigmoid(logit_48h).cpu().numpy())
        all_targets_48h.extend(target_48h.numpy())
        
        all_preds_sev.extend(torch.argmax(logits_sev, dim=1).cpu().numpy())
        all_targets_sev.extend(target_sev.numpy())

auc_24h = roc_auc_score(all_targets_24h, all_probs_24h)
prec_24h = precision_score(all_targets_24h, np.array(all_probs_24h) > 0.5, zero_division=0)
rec_24h = recall_score(all_targets_24h, np.array(all_probs_24h) > 0.5, zero_division=0)
f1_24h = f1_score(all_targets_24h, np.array(all_probs_24h) > 0.5, zero_division=0)

auc_48h = roc_auc_score(all_targets_48h, all_probs_48h)
f1_sev = f1_score(all_targets_sev, all_preds_sev, average="weighted", zero_division=0)

print("\n" + "="*50)
print("             TEST SET PERFORMANCE METRICS            ")
print("="*50)
print(f"24h Risk Horizon  - ROC-AUC:   {auc_24h:.4f}")
print(f"24h Risk Horizon  - Precision: {prec_24h:.4f}")
print(f"24h Risk Horizon  - Recall:    {rec_24h:.4f}")
print(f"24h Risk Horizon  - F1-Score:  {f1_24h:.4f}")
print("-" * 50)
print(f"48h Risk Horizon  - ROC-AUC:   {auc_48h:.4f}")
print(f"Severity Class    - Weighted F1: {f1_sev:.4f}")
print("="*50)

# ==========================================
# 7. SAVE ARTIFACTS
# ==========================================
print("\n--- SAVING MODEL & PREPROCESSING CONFIGURATION ---")
model_to_save = model.module if hasattr(model, 'module') else model

torch.save(model_to_save.state_dict(), MODEL_SAVE_PATH)
print(f"💾 Model weights saved to: {MODEL_SAVE_PATH}")

preprocessor_config = {
    "static_mean": train_dataset.static_mean,
    "static_std": train_dataset.static_std,
    "ts_mean": ts_mean,
    "ts_std": ts_std,
    "static_feature_names": train_dataset.feature_names,
    "ts_feature_names": ts_num_cols.tolist(),
    "static_dim": static_input_dim,
    "dynamic_channels": dynamic_channels
}

with open(CONFIG_SAVE_PATH, "wb") as f:
    pickle.dump(preprocessor_config, f)

print(f"💾 Preprocessor config saved to: {CONFIG_SAVE_PATH}")
print("🎉 Execution and saving completed successfully!")