#combine both the models
import os
import warnings
import pickle
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import TensorDataset, DataLoader, Dataset
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score

warnings.filterwarnings("ignore")

# ==========================================
# 1. DYNAMIC PATH DISCOVERY
# ==========================================
def resolve_dataset_paths():
    candidates = [
        "/kaggle/input/aasthma2/data",
        "/kaggle/input/aasthma/data",
        "/kaggle/input/aasthma2",
        "/kaggle/input/aasthma",
        "/kaggle/working/data",
        "/kaggle/working",
        "data",
        "."
    ]
    for base in candidates:
        target = os.path.join(base, "static", "patients.csv")
        if os.path.exists(target):
            return base
            
    for root, dirs, files in os.walk("/kaggle"):
        if "patients.csv" in files and root.endswith("static"):
            return os.path.dirname(root)
            
    return None

DATA_BASE = resolve_dataset_paths()
if DATA_BASE is None:
    raise FileNotFoundError("Could not locate static/patients.csv anywhere in directory tree.")

PATIENTS_PATH = os.path.join(DATA_BASE, "static", "patients.csv")
HISTORY_PATH = os.path.join(DATA_BASE, "static", "history_features.csv")
TIMESERIES_PATH = os.path.join(DATA_BASE, "dynamic", "timeseries.tsv")
EVENTS_PATH = os.path.join(DATA_BASE, "labels", "events.csv")

OUTPUT_DIR = "/kaggle/working"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Saved Checkpoint Paths
TCN_MODEL_PATH = os.path.join(OUTPUT_DIR, "digital_twin_model.pt")
TCN_CONFIG_PATH = os.path.join(OUTPUT_DIR, "preprocessor_config.pkl")
GB_MODEL_PATH = os.path.join(OUTPUT_DIR, "gb_digital_twin_models.pkl")
GB_CONFIG_PATH = os.path.join(OUTPUT_DIR, "gb_preprocessor_config.pkl")
META_MODEL_SAVE_PATH = os.path.join(OUTPUT_DIR, "meta_ensemble_model.pt")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"✅ Verified Active Data Base: {DATA_BASE}")
print(f"✅ Execution Device:           {device}")

# ==========================================
# 2. DATASET CLASS DEFINITION
# ==========================================
class FastDigitalTwinDataset(Dataset):
    def __init__(self, patient_ids, static_df, ts_df, event_map, static_mean=None, static_std=None, window_size=12):
        self.window_size = window_size
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
        
        static_list, dynamic_list = [], []
        target_24h_list, target_48h_list, target_sev_list = [], [], []

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
                
            for end_idx in range(window_size - 1, num_rows):
                start_idx = end_idx - (window_size - 1)
                current_hour = timestamps[end_idx]
                
                window_mat = features_matrix[start_idx : end_idx + 1].T
                
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
# 3. BASE & META MODEL ARCHITECTURES
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
# 4. TABULAR FEATURE EXTRACTION
# ==========================================
def extract_tabular_features(patient_ids, static_encoded, ts_df, event_map, window_size=12):
    ts_num_cols = ts_df.columns.difference(["patient_id", "timestamp_hour"]).tolist()
    num_dyn_feats = len(ts_num_cols)
    pid_to_static_idx = {pid: i for i, pid in enumerate(static_encoded["patient_id"].values)}
    static_mat = static_encoded.drop(columns=["patient_id"]).values.astype(np.float32)

    X_list, y_24h_list, y_48h_list, y_sev_list = [], [], [], []
    ts_split = ts_df[ts_df["patient_id"].isin(patient_ids)]
    
    for pid, group in ts_split.groupby("patient_id", sort=False):
        if pid not in pid_to_static_idx:
            continue
        static_vec = static_mat[pid_to_static_idx[pid]]
        group_sorted = group.sort_values("timestamp_hour")
        raw_dyn = group_sorted[ts_num_cols].values.astype(np.float32)
        timestamps = group_sorted["timestamp_hour"].values
        p_events = event_map.get(pid, [])
        
        N = len(raw_dyn)
        if N < window_size:
            continue

        windows = np.lib.stride_tricks.sliding_window_view(raw_dyn, (window_size, num_dyn_feats)).squeeze(1)
        num_windows = windows.shape[0]

        means = np.mean(windows, axis=1)
        stds = np.std(windows, axis=1)
        mins = np.min(windows, axis=1)
        maxs = np.max(windows, axis=1)
        deltas = windows[:, -1, :] - windows[:, 0, :]

        curr_idx = window_size - 1
        shift_indices = np.clip(curr_idx + np.array([-2, -1, 0, 1, 2]), 0, window_size - 1)
        shifts = windows[:, shift_indices, :]

        dyn_extracted = []
        for f_idx in range(num_dyn_feats):
            dyn_extracted.extend([
                means[:, f_idx:f_idx+1], stds[:, f_idx:f_idx+1],
                mins[:, f_idx:f_idx+1], maxs[:, f_idx:f_idx+1],
                deltas[:, f_idx:f_idx+1], shifts[:, :, f_idx]
            ])
            
        dyn_mat = np.hstack(dyn_extracted)
        static_broad = np.tile(static_vec, (num_windows, 1))
        x_combined = np.hstack([static_broad, dyn_mat])

        window_end_hours = timestamps[window_size - 1:]
        t_24h = np.zeros(num_windows, dtype=np.float32)
        t_48h = np.zeros(num_windows, dtype=np.float32)
        t_sev = np.zeros(num_windows, dtype=np.int64)

        for w_i, current_hour in enumerate(window_end_hours):
            for ev_start, ev_end, sev in p_events:
                if current_hour < ev_start <= current_hour + 24 or (ev_start <= current_hour <= ev_end):
                    t_24h[w_i] = 1.0
                    t_sev[w_i] = max(t_sev[w_i], int(sev))
                if current_hour < ev_start <= current_hour + 48 or (ev_start <= current_hour <= ev_end):
                    t_48h[w_i] = 1.0
                    t_sev[w_i] = max(t_sev[w_i], int(sev))

        X_list.append(x_combined)
        y_24h_list.append(t_24h)
        y_48h_list.append(t_48h)
        y_sev_list.append(t_sev)

    return np.vstack(X_list), np.concatenate(y_24h_list), np.concatenate(y_48h_list), np.concatenate(y_sev_list)

# ==========================================
# 5. EXECUTION & TRAINING
# ==========================================
print("\nLoading dataset and existing model checkpoints from previous runs...")
patients_df = pd.read_csv(PATIENTS_PATH)
history_df = pd.read_csv(HISTORY_PATH)
ts_df = pd.read_csv(TIMESERIES_PATH, sep="\t")
events_df = pd.read_csv(EVENTS_PATH)

static_merged = pd.merge(patients_df, history_df, on="patient_id")
all_pids = np.unique(static_merged["patient_id"].values)
np.random.seed(42)
np.random.shuffle(all_pids)

n_total = len(all_pids)
n_train = int(0.80 * n_total)
n_val = int(0.10 * n_total)

train_pids = all_pids[:n_train]
val_pids = all_pids[n_train:n_train + n_val]
test_pids = all_pids[n_train + n_val:]

# Load Saved Base Models and Configurations
with open(TCN_CONFIG_PATH, "rb") as f:
    tcn_config = pickle.load(f)

tcn_model = DigitalTwinFusionModel(
    static_dim=tcn_config["static_dim"],
    dynamic_channels=tcn_config["dynamic_channels"]
)
tcn_model.load_state_dict(torch.load(TCN_MODEL_PATH, map_location=device))
tcn_model.to(device)
tcn_model.eval()

with open(GB_MODEL_PATH, "rb") as f:
    gb_artifacts = pickle.load(f)
    gb_24h = gb_artifacts["model_24h"]
    gb_48h = gb_artifacts["model_48h"]
    gb_sev = gb_artifacts["model_sev"]

static_ids = static_merged[["patient_id"]]
static_features = pd.get_dummies(static_merged.drop(columns=["patient_id"]))
static_norm = (static_features - tcn_config["static_mean"]) / tcn_config["static_std"]
static_norm["patient_id"] = static_ids["patient_id"]

ts_num_cols = ts_df.columns.difference(["patient_id", "timestamp_hour"])
ts_df[ts_num_cols] = (ts_df[ts_num_cols] - tcn_config["ts_mean"]) / tcn_config["ts_std"]

event_map = {}
for _, row in events_df.iterrows():
    pid = row["patient_id"]
    start_h = int(row["event_time_hour"])
    duration = int(row.get("duration_hours", 18))
    sev = int(row["severity_score"])
    if pid not in event_map:
        event_map[pid] = []
    event_map[pid].append((start_h, start_h + duration, sev))

print("Extracting base model outputs for Stacking Meta-Feature Vector construction...")
X_val_tab, y_val_24h, y_val_48h, y_val_sev = extract_tabular_features(val_pids, static_norm, ts_df, event_map)
X_test_tab, y_test_24h, y_test_48h, y_test_sev = extract_tabular_features(test_pids, static_norm, ts_df, event_map)

# Get XGBoost predicted probabilities
xgb_val_p24 = gb_24h.predict_proba(X_val_tab)[:, 1]
xgb_val_p48 = gb_48h.predict_proba(X_val_tab)[:, 1]
xgb_val_psev = gb_sev.predict_proba(X_val_tab)

xgb_test_p24 = gb_24h.predict_proba(X_test_tab)[:, 1]
xgb_test_p48 = gb_48h.predict_proba(X_test_tab)[:, 1]
xgb_test_psev = gb_sev.predict_proba(X_test_tab)

if xgb_val_psev.shape[1] < 4:
    pad_val = np.zeros((xgb_val_psev.shape[0], 4 - xgb_val_psev.shape[1]))
    xgb_val_psev = np.hstack([xgb_val_psev, pad_val])
if xgb_test_psev.shape[1] < 4:
    pad_test = np.zeros((xgb_test_psev.shape[0], 4 - xgb_test_psev.shape[1]))
    xgb_test_psev = np.hstack([xgb_test_psev, pad_test])

val_dataset = FastDigitalTwinDataset(val_pids, static_merged, ts_df, event_map, static_mean=tcn_config["static_mean"], static_std=tcn_config["static_std"])
test_dataset = FastDigitalTwinDataset(test_pids, static_merged, ts_df, event_map, static_mean=tcn_config["static_mean"], static_std=tcn_config["static_std"])

val_loader = DataLoader(val_dataset, batch_size=256, shuffle=False)
test_loader = DataLoader(test_dataset, batch_size=256, shuffle=False)

def get_tcn_probs(loader):
    p24_list, p48_list, psev_list = [], [], []
    with torch.no_grad():
        for sx, dx, _, _, _ in loader:
            sx, dx = sx.to(device), dx.to(device)
            l24, l48, lsev = tcn_model(sx, dx)
            p24_list.extend(torch.sigmoid(l24).cpu().numpy())
            p48_list.extend(torch.sigmoid(l48).cpu().numpy())
            psev_list.extend(torch.softmax(lsev, dim=1).cpu().numpy())
    return np.array(p24_list), np.array(p48_list), np.array(psev_list)

tcn_val_p24, tcn_val_p48, tcn_val_psev = get_tcn_probs(val_loader)
tcn_test_p24, tcn_test_p48, tcn_test_psev = get_tcn_probs(test_loader)

# Construct 12D Meta-Feature Vectors
X_meta_val = np.hstack([
    tcn_val_p24.reshape(-1, 1), xgb_val_p24.reshape(-1, 1),
    tcn_val_p48.reshape(-1, 1), xgb_val_p48.reshape(-1, 1),
    tcn_val_psev, xgb_val_psev
])

X_meta_test = np.hstack([
    tcn_test_p24.reshape(-1, 1), xgb_test_p24.reshape(-1, 1),
    tcn_test_p48.reshape(-1, 1), xgb_test_p48.reshape(-1, 1),
    tcn_test_psev, xgb_test_psev
])

print("\n🧠 Training MLP Stacking Meta-Learner Model...")
meta_model = RespiTwinMLPMetaLearner(input_dim=12).to(device)
optimizer = optim.AdamW(meta_model.parameters(), lr=1e-3, weight_decay=1e-4)

criterion_bce = nn.BCEWithLogitsLoss()
criterion_ce = nn.CrossEntropyLoss()

val_dataset_meta = TensorDataset(
    torch.tensor(X_meta_val, dtype=torch.float32),
    torch.tensor(y_val_24h, dtype=torch.float32),
    torch.tensor(y_val_48h, dtype=torch.float32),
    torch.tensor(y_val_sev, dtype=torch.long)
)
meta_loader = DataLoader(val_dataset_meta, batch_size=64, shuffle=True)

meta_model.train()
for epoch in range(20):
    total_l = 0.0
    for bx, b24, b48, bsev in meta_loader:
        bx, b24, b48, bsev = bx.to(device), b24.to(device), b48.to(device), bsev.to(device)
        optimizer.zero_grad()
        
        l24, l48, lsev = meta_model(bx)
        loss = criterion_bce(l24, b24) + criterion_bce(l48, b48) + criterion_ce(lsev, bsev)
        loss.backward()
        optimizer.step()
        total_l += loss.item()
        
    if (epoch + 1) % 5 == 0:
        print(f"Epoch [{epoch+1:02d}/20] - Stacking Loss: {total_l/len(meta_loader):.4f}")

torch.save(meta_model.state_dict(), META_MODEL_SAVE_PATH)
print(f"💾 Saved MLP Stacking Meta-Learner Model to: {META_MODEL_SAVE_PATH}")

print("\n--- RUNNING TEST SET BENCHMARK EVALUATION ---")
meta_model.eval()

with torch.no_grad():
    t_test_meta = torch.tensor(X_meta_test, dtype=torch.float32).to(device)
    logit_24h, logit_48h, logits_sev = meta_model(t_test_meta)
    
    probs_24h = torch.sigmoid(logit_24h).cpu().numpy()
    probs_48h = torch.sigmoid(logit_48h).cpu().numpy()
    preds_sev = torch.argmax(logits_sev, dim=1).cpu().numpy()

auc_24h = roc_auc_score(y_test_24h, probs_24h)
prec_24h = precision_score(y_test_24h, probs_24h > 0.5, zero_division=0)
rec_24h = recall_score(y_test_24h, probs_24h > 0.5, zero_division=0)
f1_24h = f1_score(y_test_24h, probs_24h > 0.5, zero_division=0)

auc_48h = roc_auc_score(y_test_48h, probs_48h)
f1_sev = f1_score(y_test_sev, preds_sev, average="weighted", zero_division=0)

print("\n" + "="*50)
print("     MLP META-LEARNER ENSEMBLE TEST METRICS          ")
print("="*50)
print(f"24h Risk Horizon  - ROC-AUC:   {auc_24h:.4f}")
print(f"24h Risk Horizon  - Precision: {prec_24h:.4f}")
print(f"24h Risk Horizon  - Recall:    {rec_24h:.4f}")
print(f"24h Risk Horizon  - F1-Score:  {f1_24h:.4f}")
print("-" * 50)
print(f"48h Risk Horizon  - ROC-AUC:   {auc_48h:.4f}")
print(f"Severity Class    - Weighted F1: {f1_sev:.4f}")
print("="*50)
print("🎉 Full Pipeline Completed and Stacking Meta-Learner Saved!")