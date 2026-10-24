import os
import sys
import re
import pickle
import warnings
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score

if sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

warnings.filterwarnings("ignore")

import xgboost as xgb
import torch

# ==============================================================================
# XGBOOST_v2 WITH AUTO-DETECTED DYNAMIC FEATURES & GPU ACCELERATION
# ==============================================================================

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
GB_MODEL_SAVE_PATH = os.path.join(OUTPUT_DIR, "gb_digital_twin_models_v2.pkl")
GB_CONFIG_SAVE_PATH = os.path.join(OUTPUT_DIR, "gb_preprocessor_config_v2.pkl")

# Device selection: Use CUDA if available
use_cuda = torch.cuda.is_available()
xgb_device = "cuda" if use_cuda else "cpu"

print(f"[+] Gradient Boosting Device: {xgb_device} | CUDA Available: {use_cuda}")
print(f"[OK] Verified Data Base:     {INPUT_BASE}")
print(f"[OK] Model Output Save Path: {GB_MODEL_SAVE_PATH}")
print(f"[OK] Config Save Path:       {GB_CONFIG_SAVE_PATH}")

# ==============================================================================
# FAST VECTORIZED TABULAR FEATURE EXTRACTION
# ==============================================================================
def prepare_tabular_dataset_fast(patient_ids, static_encoded, ts_df, event_map, window_size=12):
    ts_num_cols = [c for c in ts_df.columns if c not in ["patient_id", "timestamp_hour"]]
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
                if (current_hour < ev_start <= current_hour + 24) or (ev_start <= current_hour <= ev_end):
                    t_24h[w_i] = 1.0
                    t_sev[w_i] = max(t_sev[w_i], int(sev))
                if (current_hour < ev_start <= current_hour + 48) or (ev_start <= current_hour <= ev_end):
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

# ==============================================================================
# PIPELINE EXECUTION
# ==============================================================================
def main():
    print("\n--- [STEP 1] LOADING DATA & AUTO-DETECTING FEATURES ---")
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

    # Auto-detect dynamic channels
    ts_num_cols = [c for c in ts_df.columns if c not in ["patient_id", "timestamp_hour"]]
    print(f"[*] Auto-detected {len(ts_num_cols)} Dynamic Telemetry Channels")

    # Train / Val / Test Split
    np.random.seed(42)
    shuffled_pids = common_pids.copy()
    np.random.shuffle(shuffled_pids)
    n_total = len(shuffled_pids)
    n_train = int(0.80 * n_total)
    n_val = int(0.10 * n_total)

    train_pids = shuffled_pids[:n_train]
    val_pids = shuffled_pids[n_train:n_train + n_val]
    test_pids = shuffled_pids[n_train + n_val:]

    # Static encoding & normalization
    static_cohort = static_merged[static_merged["patient_id"].isin(common_pids)].copy()
    static_ids = static_cohort[["patient_id"]]
    static_features = pd.get_dummies(static_cohort.drop(columns=["patient_id"]))

    train_mask_static = static_ids["patient_id"].isin(train_pids)
    static_mean = static_features[train_mask_static].mean()
    static_std = static_features[train_mask_static].std().replace(0, 1.0) + 1e-8
    static_norm = (static_features - static_mean) / static_std
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

    print("\n--- [STEP 2] EXTRACTING TABULAR MATRIX WITH TEMPORAL EXPANSION ---")
    X_train, y_train_24h, y_train_48h, y_train_sev, feature_cols = prepare_tabular_dataset_fast(train_pids, static_norm, ts_df_norm, event_map)
    X_val, y_val_24h, y_val_48h, y_val_sev, _ = prepare_tabular_dataset_fast(val_pids, static_norm, ts_df_norm, event_map)
    X_test, y_test_24h, y_test_48h, y_test_sev, _ = prepare_tabular_dataset_fast(test_pids, static_norm, ts_df_norm, event_map)

    y_train_sev = y_train_sev.astype(np.int64)
    y_val_sev = y_val_sev.astype(np.int64)
    y_test_sev = y_test_sev.astype(np.int64)
    num_sev_classes = 4

    print(f"[*] Expanded Feature Count: {X_train.shape[1]} (Static={static_norm.shape[1]-1}, Dynamic={X_train.shape[1]-(static_norm.shape[1]-1)})")
    print(f"[*] Dataset Matrix Dimensions: Train={X_train.shape}, Val={X_val.shape}, Test={X_test.shape}")

    print("\n--- [STEP 3] TRAINING XGBOOST_v2 CLASSIFIERS (GPU: CUDA) ---")
    print(f"Configuring 3 XGBoost models with device='{xgb_device}', tree_method='hist'...")
    model_24h = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.05,
        tree_method="hist",
        device=xgb_device,
        eval_metric="logloss",
        random_state=42
    )
    model_48h = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.05,
        tree_method="hist",
        device=xgb_device,
        eval_metric="logloss",
        random_state=42
    )
    model_sev = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.05,
        tree_method="hist",
        device=xgb_device,
        objective="multi:softprob",
        num_class=num_sev_classes,
        eval_metric="mlogloss",
        random_state=42
    )

    print("Fitting 24h Risk Model on GPU...")
    model_24h.fit(X_train, y_train_24h, eval_set=[(X_val, y_val_24h)], verbose=False)
    print("Fitting 48h Risk Model on GPU...")
    model_48h.fit(X_train, y_train_48h, eval_set=[(X_val, y_val_48h)], verbose=False)
    print("Fitting 4-Class Severity Model on GPU...")
    model_sev.fit(X_train, y_train_sev, eval_set=[(X_val, y_val_sev)], verbose=False)

    print("\n--- [STEP 4] EVALUATING XGBOOST_v2 ON TEST SET ---")
    probs_24h = model_24h.predict_proba(X_test)[:, 1]
    probs_48h = model_48h.predict_proba(X_test)[:, 1]
    raw_preds_sev = model_sev.predict(X_test)
    preds_sev = np.argmax(raw_preds_sev, axis=1) if raw_preds_sev.ndim > 1 else raw_preds_sev.astype(np.int64)

    auc_24h = roc_auc_score(y_test_24h, probs_24h) if len(np.unique(y_test_24h)) > 1 else 0.5
    f1_24h = f1_score(y_test_24h, probs_24h > 0.5, zero_division=0)
    auc_48h = roc_auc_score(y_test_48h, probs_48h) if len(np.unique(y_test_48h)) > 1 else 0.5
    f1_sev = f1_score(y_test_sev, preds_sev, average="weighted", zero_division=0)

    print("=" * 60)
    print("               XGBOOST_v2 TEST METRICS               ")
    print("=" * 60)
    print(f"24h Horizon ROC-AUC:   {auc_24h:.4f} | F1-Score: {f1_24h:.4f}")
    print(f"48h Horizon ROC-AUC:   {auc_48h:.4f}")
    print(f"Severity Class F1:     {f1_sev:.4f}")
    print("=" * 60)

    print("\n--- [STEP 5] SAVING XGBOOST_v2 ARTIFACTS ---")
    models_dict = {
        "model_24h": model_24h,
        "model_48h": model_48h,
        "model_sev": model_sev,
        "gb_engine": "xgboost"
    }
    with open(GB_MODEL_SAVE_PATH, "wb") as f:
        pickle.dump(models_dict, f)
    print(f"[+] Models saved: {GB_MODEL_SAVE_PATH}")

    preprocessor_config = {
        "static_mean": static_mean,
        "static_std": static_std,
        "ts_mean": ts_mean,
        "ts_std": ts_std,
        "feature_cols": feature_cols
    }
    with open(GB_CONFIG_SAVE_PATH, "wb") as f:
        pickle.dump(preprocessor_config, f)
    print(f"[+] Preprocessor config saved: {GB_CONFIG_SAVE_PATH}")
    print("[OK] XGBoost_v2 Training Finished Successfully!")

if __name__ == "__main__":
    main()
