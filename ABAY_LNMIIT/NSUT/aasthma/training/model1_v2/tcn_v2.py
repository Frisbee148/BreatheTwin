import os
import sys
import re
import pickle
import warnings
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score

if sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

warnings.filterwarnings("ignore")

# ==============================================================================
# TCN_v2 MODEL WITH EXTENDED DYNAMIC FEATURE DETECTION
# ==============================================================================

if torch.cuda.is_available():
    torch.set_float32_matmul_precision('high')

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"[+] TCN_v2 Training Device: {device} | Device Name: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'}")

def normalize_pid(pid: str) -> str:
    m = re.match(r"^PATIENT_(\d+)$", str(pid).strip())
    if m:
        return f"PATIENT_{int(m.group(1)):04d}"
    return str(pid).strip()

def find_dataset_base():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.abspath(os.path.join(current_dir, "..", "..", "dataset", "data")),
        os.path.abspath(os.path.join(current_dir, "..", "dataset", "data")),
        "dataset/data",
        "aasthma/dataset/data",
    ]
    for base in candidates:
        target = os.path.join(base, "dynamic2,0", "timeseries.tsv")
        if os.path.exists(target):
            return base
    raise FileNotFoundError("Could not locate dynamic2,0/timeseries.tsv in search candidates.")

INPUT_BASE = find_dataset_base()
PATIENTS_PATH = os.path.join(INPUT_BASE, "static", "patients.csv")
HISTORY_PATH = os.path.join(INPUT_BASE, "static", "history_features.csv")
TIMESERIES_PATH = os.path.join(INPUT_BASE, "dynamic2,0", "timeseries.tsv")
EVENTS_PATH = os.path.join(INPUT_BASE, "labels", "events.csv")

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUTPUT_DIR, exist_ok=True)
MODEL_SAVE_PATH = os.path.join(OUTPUT_DIR, "digital_twin_model_v2.pt")
CONFIG_SAVE_PATH = os.path.join(OUTPUT_DIR, "preprocessor_config_v2.pkl")

print(f"[OK] Verified Active Dataset Base: {INPUT_BASE}")
print(f"[OK] Timeseries Source:           {TIMESERIES_PATH}")
print(f"[OK] Model Output Destination:     {MODEL_SAVE_PATH}")
print(f"[OK] Config Output Destination:    {CONFIG_SAVE_PATH}")

# ==============================================================================
# MODEL ARCHITECTURE (Channel-Adaptive TCN)
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

# ==============================================================================
# FAST DATASET LOADER
# ==============================================================================
class FastDigitalTwinDataset(Dataset):
    def __init__(self, patient_ids, norm_static_df, ts_df, event_map, window_size=12):
        self.window_size = window_size
        ts_num_cols = [c for c in ts_df.columns if c not in ["patient_id", "timestamp_hour"]]
        pid_to_static_idx = {pid: i for i, pid in enumerate(norm_static_df["patient_id"].values)}
        static_mat = norm_static_df.drop(columns=["patient_id"]).values.astype(np.float32)

        static_list = []
        dynamic_list = []
        target_24h_list = []
        target_48h_list = []
        target_sev_list = []

        ts_split = ts_df[ts_df["patient_id"].isin(patient_ids)]
        for pid, group in ts_split.groupby("patient_id", sort=False):
            if pid not in pid_to_static_idx:
                continue
            p_static_vec = static_mat[pid_to_static_idx[pid]]
            group_sorted = group.sort_values("timestamp_hour")
            features_matrix = group_sorted[ts_num_cols].values.astype(np.float32)
            timestamps = group_sorted["timestamp_hour"].values
            p_events = event_map.get(pid, [])
            num_rows = len(group_sorted)
            if num_rows < window_size:
                continue

            for end_idx in range(window_size - 1, num_rows):
                start_idx = end_idx - (window_size - 1)
                current_hour = timestamps[end_idx]
                window_mat = features_matrix[start_idx : end_idx + 1].T  # [Channels, Window_Size]

                target_24h, target_48h, target_sev = 0.0, 0.0, 0
                for ev_start, ev_end, sev in p_events:
                    if (current_hour < ev_start <= current_hour + 24) or (ev_start <= current_hour <= ev_end):
                        target_24h = 1.0
                        target_sev = max(target_sev, int(sev))
                    if (current_hour < ev_start <= current_hour + 48) or (ev_start <= current_hour <= ev_end):
                        target_48h = 1.0
                        target_sev = max(target_sev, int(sev))

                static_list.append(p_static_vec)
                dynamic_list.append(window_mat)
                target_24h_list.append(target_24h)
                target_48h_list.append(target_48h)
                target_sev_list.append(target_sev)

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

# ==============================================================================
# PIPELINE EXECUTION
# ==============================================================================
def main():
    print("\n--- [STEP 1] LOADING DATA & AUTO-DETECTING FEATURES ---")
    patients_df = pd.read_csv(PATIENTS_PATH)
    history_df = pd.read_csv(HISTORY_PATH)
    ts_df = pd.read_csv(TIMESERIES_PATH, sep="\t")
    events_df = pd.read_csv(EVENTS_PATH)

    # Normalize patient IDs for seamless multi-source joining
    patients_df["patient_id"] = patients_df["patient_id"].apply(normalize_pid)
    history_df["patient_id"] = history_df["patient_id"].apply(normalize_pid)
    ts_df["patient_id"] = ts_df["patient_id"].apply(normalize_pid)
    events_df["patient_id"] = events_df["patient_id"].apply(normalize_pid)

    static_merged = pd.merge(patients_df, history_df, on="patient_id")
    
    # Auto-detect dynamic channels
    ts_num_cols = [c for c in ts_df.columns if c not in ["patient_id", "timestamp_hour"]]
    dynamic_channels = len(ts_num_cols)
    print(f"[*] Auto-detected {dynamic_channels} Dynamic Telemetry Channels:")
    for i, col in enumerate(ts_num_cols, 1):
        print(f"   {i:2d}. {col}")

    # Auto-detect static features
    common_pids = np.array(sorted(list(set(static_merged["patient_id"]).intersection(set(ts_df["patient_id"])))))
    print(f"[*] Matched Cohort: {len(common_pids)} patients present across static and dynamic2,0 data")

    static_cohort = static_merged[static_merged["patient_id"].isin(common_pids)].copy()
    static_ids = static_cohort[["patient_id"]]
    static_encoded = pd.get_dummies(static_cohort.drop(columns=["patient_id"]))
    static_feature_names = static_encoded.columns.tolist()
    static_dim = len(static_feature_names)
    print(f"[*] Auto-detected {static_dim} Static Encoded Features")

    # 80/10/10 Train / Val / Test Split
    np.random.seed(42)
    shuffled_pids = common_pids.copy()
    np.random.shuffle(shuffled_pids)
    n_total = len(shuffled_pids)
    n_train = int(0.80 * n_total)
    n_val = int(0.10 * n_total)

    train_pids = shuffled_pids[:n_train]
    val_pids = shuffled_pids[n_train:n_train + n_val]
    test_pids = shuffled_pids[n_train + n_val:]
    print(f"[*] Split Distribution: Train={len(train_pids)} pts, Val={len(val_pids)} pts, Test={len(test_pids)} pts")

    # Static normalization
    train_mask_static = static_ids["patient_id"].isin(train_pids)
    static_mean = static_encoded[train_mask_static].mean()
    static_std = static_encoded[train_mask_static].std().replace(0, 1.0) + 1e-8
    static_norm = (static_encoded - static_mean) / static_std
    static_norm["patient_id"] = static_ids["patient_id"]

    # Dynamic normalization
    ts_train_mask = ts_df["patient_id"].isin(train_pids)
    ts_mean = ts_df.loc[ts_train_mask, ts_num_cols].mean()
    ts_std = ts_df.loc[ts_train_mask, ts_num_cols].std().replace(0, 1.0) + 1e-8
    ts_df_norm = ts_df.copy()
    ts_df_norm[ts_num_cols] = (ts_df_norm[ts_num_cols] - ts_mean) / ts_std

    # Event mapping
    event_map = {}
    for _, row in events_df.iterrows():
        pid = row["patient_id"]
        start_h = int(row["event_time_hour"])
        duration = int(row.get("duration_hours", 18))
        sev = int(row["severity_score"])
        if pid not in event_map:
            event_map[pid] = []
        event_map[pid].append((start_h, start_h + duration, sev))

    print("\n--- [STEP 2] BUILDING SLIDING WINDOW DATASETS ---")
    train_dataset = FastDigitalTwinDataset(train_pids, static_norm, ts_df_norm, event_map)
    val_dataset = FastDigitalTwinDataset(val_pids, static_norm, ts_df_norm, event_map)
    test_dataset = FastDigitalTwinDataset(test_pids, static_norm, ts_df_norm, event_map)

    print(f"[*] Window Samples: Train={len(train_dataset)}, Val={len(val_dataset)}, Test={len(test_dataset)}")

    train_loader = DataLoader(train_dataset, batch_size=256, shuffle=True, pin_memory=(device.type == 'cuda'))
    val_loader = DataLoader(val_dataset, batch_size=256, shuffle=False, pin_memory=(device.type == 'cuda'))
    test_loader = DataLoader(test_dataset, batch_size=256, shuffle=False, pin_memory=(device.type == 'cuda'))

    print("\n--- [STEP 3] INITIALIZING TCN_v2 MODEL ON GPU ---")
    model = DigitalTwinFusionModel(static_dim=static_dim, dynamic_channels=dynamic_channels).to(device)
    print(f"Model Architecture: Static Dim={static_dim}, Dynamic Channels={dynamic_channels}")

    criterion_bce = nn.BCEWithLogitsLoss()
    criterion_ce = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    scaler = torch.cuda.amp.GradScaler(enabled=(device.type == 'cuda'))

    EPOCHS = 10
    print(f"\n--- [STEP 4] TRAINING TCN_v2 ({EPOCHS} EPOCHS WITH ADAMW + AMP) ---")
    for epoch in range(EPOCHS):
        model.train()
        train_loss, train_correct, train_total = 0.0, 0, 0
        for s_x, d_x, y24, y48, ysev in train_loader:
            s_x, d_x = s_x.to(device, non_blocking=True), d_x.to(device, non_blocking=True)
            y24, y48, ysev = y24.to(device, non_blocking=True), y48.to(device, non_blocking=True), ysev.to(device, non_blocking=True)

            optimizer.zero_grad(set_to_none=True)
            with torch.cuda.amp.autocast(enabled=(device.type == 'cuda')):
                l24, l48, lsev = model(s_x, d_x)
                loss = criterion_bce(l24, y24) + (0.5 * criterion_bce(l48, y48)) + (0.5 * criterion_ce(lsev, ysev))

            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            scaler.step(optimizer)
            scaler.update()

            train_loss += loss.item() * s_x.size(0)
            preds24 = (torch.sigmoid(l24) > 0.5).float()
            train_correct += (preds24 == y24).sum().item()
            train_total += s_x.size(0)

        # Validation
        model.eval()
        val_loss, val_correct, val_total = 0.0, 0, 0
        with torch.no_grad():
            for s_x, d_x, y24, y48, ysev in val_loader:
                s_x, d_x = s_x.to(device, non_blocking=True), d_x.to(device, non_blocking=True)
                y24, y48, ysev = y24.to(device, non_blocking=True), y48.to(device, non_blocking=True), ysev.to(device, non_blocking=True)
                with torch.cuda.amp.autocast(enabled=(device.type == 'cuda')):
                    l24, l48, lsev = model(s_x, d_x)
                    loss = criterion_bce(l24, y24) + (0.5 * criterion_bce(l48, y48)) + (0.5 * criterion_ce(lsev, ysev))
                val_loss += loss.item() * s_x.size(0)
                preds24 = (torch.sigmoid(l24) > 0.5).float()
                val_correct += (preds24 == y24).sum().item()
                val_total += s_x.size(0)

        t_acc = (train_correct / train_total) * 100
        v_acc = (val_correct / val_total) * 100
        print(f"Epoch {epoch+1:02d}/{EPOCHS:02d} | Train Loss: {train_loss/train_total:.4f} (Acc 24h: {t_acc:.2f}%) | Val Loss: {val_loss/val_total:.4f} (Acc 24h: {v_acc:.2f}%)")

    print("\n--- [STEP 5] EVALUATING TCN_v2 ON TEST SET ---")
    model.eval()
    all_targets_24h, all_probs_24h = [], []
    all_targets_48h, all_probs_48h = [], []
    all_targets_sev, all_preds_sev = [], []

    with torch.no_grad():
        for s_x, d_x, y24, y48, ysev in test_loader:
            s_x, d_x = s_x.to(device, non_blocking=True), d_x.to(device, non_blocking=True)
            with torch.cuda.amp.autocast(enabled=(device.type == 'cuda')):
                l24, l48, lsev = model(s_x, d_x)
            all_probs_24h.extend(torch.sigmoid(l24).cpu().numpy())
            all_targets_24h.extend(y24.numpy())
            all_probs_48h.extend(torch.sigmoid(l48).cpu().numpy())
            all_targets_48h.extend(y48.numpy())
            all_preds_sev.extend(torch.argmax(lsev, dim=1).cpu().numpy())
            all_targets_sev.extend(ysev.numpy())

    auc_24h = roc_auc_score(all_targets_24h, all_probs_24h) if len(np.unique(all_targets_24h)) > 1 else 0.5
    f1_24h = f1_score(all_targets_24h, np.array(all_probs_24h) > 0.5, zero_division=0)
    auc_48h = roc_auc_score(all_targets_48h, all_probs_48h) if len(np.unique(all_targets_48h)) > 1 else 0.5
    f1_sev = f1_score(all_targets_sev, all_preds_sev, average="weighted", zero_division=0)

    print("=" * 60)
    print("                 TCN_v2 TEST METRICS                ")
    print("=" * 60)
    print(f"24h Horizon ROC-AUC:   {auc_24h:.4f} | F1-Score: {f1_24h:.4f}")
    print(f"48h Horizon ROC-AUC:   {auc_48h:.4f}")
    print(f"Severity Class F1:     {f1_sev:.4f}")
    print("=" * 60)

    print("\n--- [STEP 6] SAVING TCN_v2 ARTIFACTS ---")
    torch.save(model.state_dict(), MODEL_SAVE_PATH)
    print(f"[+] Checkpoint saved: {MODEL_SAVE_PATH}")

    preprocessor_config = {
        "static_mean": static_mean,
        "static_std": static_std,
        "ts_mean": ts_mean,
        "ts_std": ts_std,
        "static_feature_names": static_feature_names,
        "ts_feature_names": ts_num_cols,
        "static_dim": static_dim,
        "dynamic_channels": dynamic_channels
    }
    with open(CONFIG_SAVE_PATH, "wb") as f:
        pickle.dump(preprocessor_config, f)
    print(f"[+] Preprocessor config saved: {CONFIG_SAVE_PATH}")
    print("[OK] TCN_v2 Training Finished Successfully!")

if __name__ == "__main__":
    main()
