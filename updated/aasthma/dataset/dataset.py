import os
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import pandas as pd
import numpy as np
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score
import warnings

warnings.filterwarnings("ignore")

# ==========================================
# 1. AUTO-RESOLVING PATH CONFIGURATION
# ==========================================
possible_bases = [
    "/kaggle/input/aasthma/data",
    "/kaggle/input/aasthma",
    "/kaggle/working/data",
    "/kaggle/working"
]

INPUT_BASE = None
for base in possible_bases:
    test_path = os.path.join(base, "static", "patients.csv")
    if os.path.exists(test_path):
        INPUT_BASE = base
        print(f"Dataset successfully detected at: {INPUT_BASE}")
        break

if INPUT_BASE is None:
    raise FileNotFoundError("Could not locate patients.csv in any expected Kaggle directory.")

PATIENTS_PATH = os.path.join(INPUT_BASE, "static", "patients.csv")
HISTORY_PATH = os.path.join(INPUT_BASE, "static", "history_features.csv")
TIMESERIES_PATH = os.path.join(INPUT_BASE, "dynamic", "timeseries.tsv")
EVENTS_PATH = os.path.join(INPUT_BASE, "labels", "events.csv")

# Setup Multi-GPU
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
num_gpus = torch.cuda.device_count()
print(f"Running on Device: {device} | Total GPUs Available: {num_gpus}")

# ==========================================
# 2. PATIENT-LEVEL SPLIT DATASET CLASS
# ==========================================
class DigitalTwinWindowDataset(Dataset):
    def __init__(self, patient_ids, static_df, ts_df, event_map, window_size=12):
        self.window_size = window_size
        self.patient_ids = patient_ids
        
        # Filter static data for designated split patients
        split_static = static_df[static_df["patient_id"].isin(patient_ids)].copy()
        
        # Encode static features
        static_encoded = pd.get_dummies(split_static.drop(columns=["patient_id"]))
        self.static_data = (static_encoded - static_encoded.mean()) / (static_encoded.std() + 1e-8)
        self.pid_to_idx = {pid: i for i, pid in enumerate(patient_ids)}
        
        # Process dynamic columns
        ts_num_cols = ts_df.columns.difference(["patient_id", "timestamp_hour"])
        
        # Build samples
        self.samples = []
        for pid in patient_ids:
            p_ts = ts_df[ts_df["patient_id"] == pid].sort_values("timestamp_hour")
            features_matrix = p_ts[ts_num_cols].values  # [240, 20]
            p_events = event_map.get(pid, [])
            
            # Slide 12-hour window across 240 hours
            for end_idx in range(self.window_size - 1, len(p_ts)):
                start_idx = end_idx - (self.window_size - 1)
                current_hour = p_ts.iloc[end_idx]["timestamp_hour"]
                
                # Matrix shape: [20 channels, 12 time steps]
                window_mat = features_matrix[start_idx : end_idx + 1].T
                
                target_24h, target_48h, target_sev = 0.0, 0.0, 0
                for ev_start, ev_end, sev in p_events:
                    if current_hour < ev_start <= current_hour + 24 or (ev_start <= current_hour <= ev_end):
                        target_24h = 1.0
                        target_sev = max(target_sev, sev)
                    if current_hour < ev_start <= current_hour + 48 or (ev_start <= current_hour <= ev_end):
                        target_48h = 1.0
                        target_sev = max(target_sev, sev)
                
                self.samples.append({
                    "patient_idx": self.pid_to_idx[pid],
                    "dynamic_window": window_mat,
                    "target_24h": target_24h,
                    "target_48h": target_48h,
                    "target_sev": target_sev
                })

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        sample = self.samples[idx]
        static_vec = torch.tensor(self.static_data.iloc[sample["patient_idx"]].values, dtype=torch.float32)
        dynamic_mat = torch.tensor(sample["dynamic_window"], dtype=torch.float32)
        
        return (
            static_vec, 
            dynamic_mat, 
            torch.tensor(sample["target_24h"], dtype=torch.float32),
            torch.tensor(sample["target_48h"], dtype=torch.float32),
            torch.tensor(sample["target_sev"], dtype=torch.long)
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

class Conv1DDynamicEncoder(nn.Module):
    def __init__(self, in_channels=20, output_dim=128):
        super().__init__()
        # 3 Conv1D Layers reducing [20, 12] -> [128, 1]
        self.conv1 = nn.Conv1d(in_channels, 32, kernel_size=3, stride=1, padding=0) # -> [32, 10]
        self.bn1 = nn.BatchNorm1d(32)
        self.relu1 = nn.ReLU()
        
        self.conv2 = nn.Conv1d(32, 64, kernel_size=3, stride=2, padding=1)           # -> [64, 5]
        self.bn2 = nn.BatchNorm1d(64)
        self.relu2 = nn.ReLU()
        
        self.conv3 = nn.Conv1d(64, output_dim, kernel_size=5, stride=1, padding=0)   # -> [128, 1]
        self.bn3 = nn.BatchNorm1d(output_dim)
        self.relu3 = nn.ReLU()
        
    def forward(self, x):
        x = self.relu1(self.bn1(self.conv1(x)))
        x = self.relu2(self.bn2(self.conv2(x)))
        x = self.relu3(self.bn3(self.conv3(x)))
        return x.squeeze(-1)

class DigitalTwinFusionModel(nn.Module):
    def __init__(self, static_dim):
        super().__init__()
        self.static_encoder = StaticMLPEncoder(input_dim=static_dim, output_dim=64)
        self.dynamic_encoder = Conv1DDynamicEncoder(in_channels=20, output_dim=128)
        
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
# 4. PREPARE DATA SPLITS (80% Train, 10% Val, 10% Test)
# ==========================================
print("Loading raw files from input directory...")
patients_df = pd.read_csv(PATIENTS_PATH)
history_df = pd.read_csv(HISTORY_PATH)
ts_df = pd.read_csv(TIMESERIES_PATH, sep="\t")
events_df = pd.read_csv(EVENTS_PATH)

static_merged = pd.merge(patients_df, history_df, on="patient_id")
ts_num_cols = ts_df.columns.difference(["patient_id", "timestamp_hour"])
ts_df[ts_num_cols] = (ts_df[ts_num_cols] - ts_df[ts_num_cols].mean()) / (ts_df[ts_num_cols].std() + 1e-8)

event_map = {}
for _, row in events_df.iterrows():
    pid = row["patient_id"]
    start_h = int(row["event_time_hour"])
    duration = int(row.get("duration_hours", 18))
    sev = int(row["severity_score"])
    if pid not in event_map:
        event_map[pid] = []
    event_map[pid].append((start_h, start_h + duration, sev))

# Patient-level split
all_pids = np.unique(static_merged["patient_id"].values)
np.random.seed(42)
np.random.shuffle(all_pids)

n_total = len(all_pids)
n_train = int(0.80 * n_total)
n_val = int(0.10 * n_total)

train_pids = all_pids[:n_train]
val_pids = all_pids[n_train:n_train + n_val]
test_pids = all_pids[n_train + n_val:]

train_dataset = DigitalTwinWindowDataset(train_pids, static_merged, ts_df, event_map)
val_dataset = DigitalTwinWindowDataset(val_pids, static_merged, ts_df, event_map)
test_dataset = DigitalTwinWindowDataset(test_pids, static_merged, ts_df, event_map)

# Fast GPU DataLoaders
train_loader = DataLoader(train_dataset, batch_size=128, shuffle=True, num_workers=4, pin_memory=True)
val_loader = DataLoader(val_dataset, batch_size=128, shuffle=False, num_workers=4, pin_memory=True)
test_loader = DataLoader(test_dataset, batch_size=128, shuffle=False, num_workers=4, pin_memory=True)

# Initialize Multi-GPU Model
static_input_dim = train_dataset[0][0].shape[0]
model = DigitalTwinFusionModel(static_dim=static_input_dim)

if num_gpus > 1:
    print(f"Wrapping model across {num_gpus} GPUs using DataParallel...")
    model = nn.DataParallel(model)

model = model.to(device)

criterion_bce = nn.BCEWithLogitsLoss()
criterion_ce = nn.CrossEntropyLoss()
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)

# ==========================================
# 5. TRAINING AND EVALUATION FUNCTIONS
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
            static_x = static_x.to(device)
            dynamic_x = dynamic_x.to(device)
            target_24h = target_24h.to(device)
            target_48h = target_48h.to(device)
            target_sev = target_sev.to(device)
            
            optimizer.zero_grad()
            logit_24h, logit_48h, logits_sev = model(static_x, dynamic_x)
            
            loss_24h = criterion_bce(logit_24h, target_24h)
            loss_48h = criterion_bce(logit_48h, target_48h)
            loss_sev = criterion_ce(logits_sev, target_sev)
            
            loss = loss_24h + (0.5 * loss_48h) + (0.5 * loss_sev)
            
            if is_train:
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                optimizer.step()
                
            total_loss += loss.item() * static_x.size(0)
            preds_24h = (torch.sigmoid(logit_24h) > 0.5).float()
            correct_24h += (preds_24h == target_24h).sum().item()
            total_samples += static_x.size(0)
            
    return total_loss / total_samples, (correct_24h / total_samples) * 100

print("\nStarting Training Execution...")
EPOCHS = 10

for epoch in range(EPOCHS):
    train_loss, train_acc = run_epoch(train_loader, is_train=True)
    val_loss, val_acc = run_epoch(val_loader, is_train=False)
    
    print(f"Epoch {epoch+1:02d}/{EPOCHS:02d} | "
          f"Train Loss: {train_loss:.4f} | Train Acc (24h): {train_acc:.2f}% | "
          f"Val Loss: {val_loss:.4f} | Val Acc (24h): {val_acc:.2f}%")

# ==========================================
# 6. COMPREHENSIVE TEST EVALUATION BENCHMARK
# ==========================================
print("\n--- RUNNING TEST SET BENCHMARK EVALUATION ---")
model.eval()

all_targets_24h, all_probs_24h = [], []
all_targets_48h, all_probs_48h = [], []
all_targets_sev, all_preds_sev = [], []

with torch.no_grad():
    for static_x, dynamic_x, target_24h, target_48h, target_sev in test_loader:
        static_x = static_x.to(device)
        dynamic_x = dynamic_x.to(device)
        
        logit_24h, logit_48h, logits_sev = model(static_x, dynamic_x)
        
        all_probs_24h.extend(torch.sigmoid(logit_24h).cpu().numpy())
        all_targets_24h.extend(target_24h.numpy())
        
        all_probs_48h.extend(torch.sigmoid(logit_48h).cpu().numpy())
        all_targets_48h.extend(target_48h.numpy())
        
        all_preds_sev.extend(torch.argmax(logits_sev, dim=1).cpu().numpy())
        all_targets_sev.extend(target_sev.numpy())

# Calculate Scikit-Learn Metrics
auc_24h = roc_auc_score(all_targets_24h, all_probs_24h)
prec_24h = precision_score(all_targets_24h, np.array(all_probs_24h) > 0.5)
rec_24h = recall_score(all_targets_24h, np.array(all_probs_24h) > 0.5)
f1_24h = f1_score(all_targets_24h, np.array(all_probs_24h) > 0.5)

auc_48h = roc_auc_score(all_targets_48h, all_probs_48h)
f1_sev = f1_score(all_targets_sev, all_preds_sev, average="weighted")

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