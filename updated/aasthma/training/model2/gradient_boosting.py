import os
import warnings
import pickle
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score

try:
    import xgboost as xgb
    GB_ENGINE = "xgboost"
except ImportError:
    import lightgbm as lgb
    GB_ENGINE = "lightgbm"

warnings.filterwarnings("ignore")

# ==========================================
# 1. FIXED DYNAMIC FILE DISCOVERY
# ==========================================
def resolve_dataset_paths():
    """
    Recursively scans /kaggle and local directories to pinpoint the exact 
    folder containing static/patients.csv without path duplication.
    """
    candidates = [
        "/kaggle/input/aasthma/data",
        "/kaggle/input/aasthma2/data",
        "/kaggle/input/aasthma",
        "/kaggle/input/aasthma2",
        "/kaggle/working/data",
        "/kaggle/working",
        "data",
        "."
    ]
    
    for base in candidates:
        target = os.path.join(base, "static", "patients.csv")
        if os.path.exists(target):
            return base
            
    # Deep search if candidate paths fail
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

GB_MODEL_SAVE_PATH = os.path.join(OUTPUT_DIR, "gb_digital_twin_models.pkl")
GB_CONFIG_SAVE_PATH = os.path.join(OUTPUT_DIR, "gb_preprocessor_config.pkl")

print(f"✅ Verified Active Data Base: {DATA_BASE}")
print(f"✅ Patients CSV Located At:   {PATIENTS_PATH}")
print(f"✅ Gradient Boosting Engine:  {GB_ENGINE.upper()}")

# ==========================================
# 2. VECTORIZED TABULAR FEATURE EXTRACTION
# ==========================================
def prepare_tabular_dataset_fast(patient_ids, static_encoded, ts_df, event_map, window_size=12):
    ts_num_cols = ts_df.columns.difference(["patient_id", "timestamp_hour"]).tolist()
    num_dyn_feats = len(ts_num_cols)
    
    feature_names = []
    for fname in ts_num_cols:
        feature_names.extend([f"{fname}_mean", f"{fname}_std", f"{fname}_min", f"{fname}_max", f"{fname}_delta"])
        for shift in [-2, -1, 0, 1, 2]:
            feature_names.append(f"{fname}_t_shift_{shift:+d}")

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
                means[:, f_idx:f_idx+1],
                stds[:, f_idx:f_idx+1],
                mins[:, f_idx:f_idx+1],
                maxs[:, f_idx:f_idx+1],
                deltas[:, f_idx:f_idx+1],
                shifts[:, :, f_idx]
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

    static_cols = static_encoded.drop(columns=["patient_id"]).columns.tolist()
    full_feature_cols = static_cols + feature_names

    X_all = np.vstack(X_list)
    y_24h_all = np.concatenate(y_24h_list)
    y_48h_all = np.concatenate(y_48h_list)
    y_sev_all = np.concatenate(y_sev_list)

    return X_all, y_24h_all, y_48h_all, y_sev_all, full_feature_cols

# ==========================================
# 3. LOAD DATA & TRAIN/VAL/TEST SPLITS
# ==========================================
print("\nLoading raw dataset files...")
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

# Encode static features
static_ids = static_merged[["patient_id"]]
static_features = pd.get_dummies(static_merged.drop(columns=["patient_id"]))

# Standardize static features
train_mask_static = static_ids["patient_id"].isin(train_pids)
static_mean = static_features[train_mask_static].mean()
static_std = static_features[train_mask_static].std() + 1e-8

static_norm = (static_features - static_mean) / static_std
static_norm["patient_id"] = static_ids["patient_id"]

# Normalize dynamic features
ts_num_cols = ts_df.columns.difference(["patient_id", "timestamp_hour"])
ts_train_mask = ts_df["patient_id"].isin(train_pids)
ts_mean = ts_df.loc[ts_train_mask, ts_num_cols].mean()
ts_std = ts_df.loc[ts_train_mask, ts_num_cols].std() + 1e-8
ts_df[ts_num_cols] = (ts_df[ts_num_cols] - ts_mean) / ts_std

print(f"📊 Extracted Dynamic Telemetry Features ({len(ts_num_cols)} channels):")
print("   " + ", ".join(ts_num_cols.tolist()))

# Build event map
event_map = {}
for _, row in events_df.iterrows():
    pid = row["patient_id"]
    start_h = int(row["event_time_hour"])
    duration = int(row.get("duration_hours", 18))
    sev = int(row["severity_score"])
    if pid not in event_map:
        event_map[pid] = []
    event_map[pid].append((start_h, start_h + duration, sev))

print("Extracting tabular feature matrices with vectorized temporal expansion...")
X_train, y_train_24h, y_train_48h, y_train_sev, feature_cols = prepare_tabular_dataset_fast(train_pids, static_norm, ts_df, event_map)
X_val, y_val_24h, y_val_48h, y_val_sev, _ = prepare_tabular_dataset_fast(val_pids, static_norm, ts_df, event_map)
X_test, y_test_24h, y_test_48h, y_test_sev, _ = prepare_tabular_dataset_fast(test_pids, static_norm, ts_df, event_map)

# Strictly cast targets to integers
y_train_sev = y_train_sev.astype(np.int64)
y_val_sev = y_val_sev.astype(np.int64)
y_test_sev = y_test_sev.astype(np.int64)

num_sev_classes = int(len(np.unique(np.concatenate([y_train_sev, y_val_sev, y_test_sev]))))
print(f"Total Expanded Feature Dimension: {X_train.shape[1]}")
print(f"Detected Severity Classes: {num_sev_classes}")

# ==========================================
# 4. MODEL TRAINING
# ==========================================
print("\n--- TRAINING GRADIENT BOOSTING MODELS ---")

if GB_ENGINE == "xgboost":
    use_cuda = os.path.exists("/dev/nvidia0")
    model_24h = xgb.XGBClassifier(
        n_estimators=200, 
        max_depth=6, 
        learning_rate=0.05, 
        tree_method="hist", 
        device="cuda" if use_cuda else "cpu", 
        eval_metric="logloss", 
        random_state=42
    )
    model_48h = xgb.XGBClassifier(
        n_estimators=200, 
        max_depth=6, 
        learning_rate=0.05, 
        tree_method="hist", 
        device="cuda" if use_cuda else "cpu", 
        eval_metric="logloss", 
        random_state=42
    )
    model_sev = xgb.XGBClassifier(
        n_estimators=200, 
        max_depth=6, 
        learning_rate=0.05, 
        tree_method="hist", 
        device="cuda" if use_cuda else "cpu", 
        objective="multi:softprob",
        num_class=num_sev_classes, 
        eval_metric="mlogloss", 
        random_state=42
    )
    
    model_24h.fit(X_train, y_train_24h, eval_set=[(X_val, y_val_24h)], verbose=False)
    model_48h.fit(X_train, y_train_48h, eval_set=[(X_val, y_val_48h)], verbose=False)
    model_sev.fit(X_train, y_train_sev, eval_set=[(X_val, y_val_sev)], verbose=False)
else:
    model_24h = lgb.LGBMClassifier(n_estimators=200, max_depth=6, learning_rate=0.05, random_state=42)
    model_48h = lgb.LGBMClassifier(n_estimators=200, max_depth=6, learning_rate=0.05, random_state=42)
    model_sev = lgb.LGBMClassifier(n_estimators=200, max_depth=6, learning_rate=0.05, num_class=num_sev_classes, objective="multiclass", random_state=42)
    
    model_24h.fit(X_train, y_train_24h, eval_set=[(X_val, y_val_24h)])
    model_48h.fit(X_train, y_train_48h, eval_set=[(X_val, y_val_48h)])
    model_sev.fit(X_train, y_train_sev, eval_set=[(X_val, y_val_sev)])

# ==========================================
# 5. EVALUATION METRICS
# ==========================================
print("\n--- RUNNING TEST SET BENCHMARK EVALUATION ---")
probs_24h = model_24h.predict_proba(X_test)[:, 1]
probs_48h = model_48h.predict_proba(X_test)[:, 1]

raw_preds_sev = model_sev.predict(X_test)

if raw_preds_sev.ndim > 1:
    preds_sev = np.argmax(raw_preds_sev, axis=1).astype(np.int64)
else:
    preds_sev = np.round(raw_preds_sev).astype(np.int64)

auc_24h = roc_auc_score(y_test_24h, probs_24h)
prec_24h = precision_score(y_test_24h, probs_24h > 0.5, zero_division=0)
rec_24h = recall_score(y_test_24h, probs_24h > 0.5, zero_division=0)
f1_24h = f1_score(y_test_24h, probs_24h > 0.5, zero_division=0)

auc_48h = roc_auc_score(y_test_48h, probs_48h)
f1_sev = f1_score(y_test_sev, preds_sev, average="weighted", zero_division=0)

print("\n" + "="*50)
print("     GRADIENT BOOSTING TEST PERFORMANCE METRICS      ")
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
# 6. SAVE GRADIENT BOOSTING ARTIFACTS
# ==========================================
print("\n--- SAVING GRADIENT BOOSTING ARTIFACTS ---")

models_dict = {
    "model_24h": model_24h,
    "model_48h": model_48h,
    "model_sev": model_sev,
    "gb_engine": GB_ENGINE
}

with open(GB_MODEL_SAVE_PATH, "wb") as f:
    pickle.dump(models_dict, f)

preprocessor_config = {
    "static_mean": static_mean,
    "static_std": static_std,
    "ts_mean": ts_mean,
    "ts_std": ts_std,
    "feature_cols": feature_cols
}

with open(GB_CONFIG_SAVE_PATH, "wb") as f:
    pickle.dump(preprocessor_config, f)

print(f"💾 Gradient Boosting models saved to: {GB_MODEL_SAVE_PATH}")
print(f"💾 Preprocessing config saved to: {GB_CONFIG_SAVE_PATH}")
print("🎉 Pipeline execution completed successfully!")