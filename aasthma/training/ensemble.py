"""Train a GPU-backed stacking model from the saved TCN and XGBoost models."""

from __future__ import annotations

import json
import os
import pickle
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score

from aasthma.models.digital_twin_model import DigitalTwinFusionModel


AASTHMA_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = AASTHMA_DIR / "dataset" / "data"
TRAINING_DIR = AASTHMA_DIR / "training"
TCN_DIR = TRAINING_DIR / "model1"
GB_DIR = TRAINING_DIR / "model2"

PATIENTS_PATH = DATA_DIR / "static" / "patients.csv"
HISTORY_PATH = DATA_DIR / "static" / "history_features.csv"
TIMESERIES_PATH = DATA_DIR / "dynamic" / "timeseries.tsv"
EVENTS_PATH = DATA_DIR / "labels" / "events.csv"
TCN_MODEL_PATH = TCN_DIR / "digital_twin_model.pt"
TCN_CONFIG_PATH = TCN_DIR / "preprocessor_config.pkl"
GB_MODEL_PATH = GB_DIR / "gb_digital_twin_models.pkl"
GB_CONFIG_PATH = GB_DIR / "gb_preprocessor_config.pkl"
META_MODEL_PATH = TRAINING_DIR / "meta_ensemble_model.pt"
META_CONFIG_PATH = TRAINING_DIR / "meta_ensemble_config.json"

WINDOW_SIZE = 12
SEED = 42
META_INPUT_FEATURES = [
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
]


class RespiTwinMLPMetaLearner(nn.Module):
    """Combine base-model probabilities into the final three predictions."""

    def __init__(self, input_dim: int = 12, hidden_dim: int = 32) -> None:
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

    def forward(
        self, x_meta: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        hidden = self.net(x_meta)
        return (
            self.head_24h(hidden).squeeze(-1),
            self.head_48h(hidden).squeeze(-1),
            self.head_sev(hidden),
        )


def build_boosting_features(
    normalized_static: np.ndarray,
    raw_windows: np.ndarray,
    config: dict[str, Any],
) -> np.ndarray:
    """Create the exact static + rolling telemetry columns used to train XGBoost."""
    static_names = list(config["static_mean"].index)
    dynamic_names = list(config["ts_mean"].index)
    expected_columns = list(config["feature_cols"])

    if normalized_static.ndim != 2 or normalized_static.shape[1] != len(static_names):
        raise ValueError("Static feature matrix does not match the XGBoost configuration.")
    if raw_windows.ndim != 3 or raw_windows.shape[2] != len(dynamic_names):
        raise ValueError("Telemetry windows do not match the XGBoost configuration.")
    if raw_windows.shape[1] < 3 or raw_windows.shape[0] != normalized_static.shape[0]:
        raise ValueError("XGBoost features require matching patient rows and >=3 telemetry hours.")

    generated_columns: list[str] = []
    dynamic_parts: list[np.ndarray] = []
    means = config["ts_mean"].reindex(dynamic_names).to_numpy(dtype=np.float64)
    stds = config["ts_std"].reindex(dynamic_names).to_numpy(dtype=np.float64)
    normalized_windows = (raw_windows.astype(np.float64) - means) / stds

    window_size = normalized_windows.shape[1]
    shift_indices = np.clip(
        window_size - 1 + np.array([-2, -1, 0, 1, 2]),
        0,
        window_size - 1,
    )
    for feature_index, feature_name in enumerate(dynamic_names):
        feature_windows = normalized_windows[:, :, feature_index]
        generated_columns.extend(
            [
                f"{feature_name}_mean",
                f"{feature_name}_std",
                f"{feature_name}_min",
                f"{feature_name}_max",
                f"{feature_name}_delta",
                *(f"{feature_name}_t_shift_{shift:+d}" for shift in range(-2, 3)),
            ]
        )
        dynamic_parts.extend(
            [
                feature_windows.mean(axis=1, keepdims=True),
                feature_windows.std(axis=1, keepdims=True),
                feature_windows.min(axis=1, keepdims=True),
                feature_windows.max(axis=1, keepdims=True),
                (feature_windows[:, -1] - feature_windows[:, 0]).reshape(-1, 1),
                feature_windows[:, shift_indices],
            ]
        )

    actual_columns = static_names + generated_columns
    if actual_columns != expected_columns:
        raise ValueError(
            "Generated XGBoost feature ordering differs from the saved model configuration."
        )

    return np.hstack([normalized_static, *dynamic_parts]).astype(np.float32)


def positive_class_probability(model: Any, values: np.ndarray) -> np.ndarray:
    class_ids = np.asarray(model.classes_)
    positive_indices = np.flatnonzero(class_ids == 1)
    if len(positive_indices) != 1:
        raise ValueError("XGBoost risk model does not expose a positive class 1.")
    return model.predict_proba(values)[:, positive_indices[0]]


def expand_severity_probabilities(model: Any, values: np.ndarray) -> np.ndarray:
    probabilities = model.predict_proba(values)
    expanded = np.zeros((len(values), 4), dtype=np.float32)
    for column, class_id in enumerate(model.classes_):
        class_index = int(class_id)
        if 0 <= class_index < 4:
            expanded[:, class_index] = probabilities[:, column]
    return expanded


def _get_base_arrays(
    patient_ids: np.ndarray,
    patients: pd.DataFrame,
    history: pd.DataFrame,
    telemetry: pd.DataFrame,
    event_map: dict[str, list[tuple[int, int, int]]],
    tcn_config: dict[str, Any],
    gb_config: dict[str, Any],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    merged = pd.merge(patients, history, on="patient_id")
    encoded = pd.get_dummies(merged.drop(columns=["patient_id"]))
    tcn_static_names = list(tcn_config["static_feature_names"])
    gb_static_names = list(gb_config["static_mean"].index)
    if tcn_static_names != gb_static_names:
        raise ValueError("TCN and XGBoost static feature names/order do not match.")

    encoded = encoded.reindex(columns=tcn_static_names, fill_value=0)
    tcn_static = (
        (encoded - tcn_config["static_mean"])
        / (tcn_config["static_std"] + 1e-8)
    ).to_numpy(dtype=np.float32)
    gb_static = (
        (encoded - gb_config["static_mean"]) / gb_config["static_std"]
    ).to_numpy(dtype=np.float32)
    static_index = {
        patient_id: index
        for index, patient_id in enumerate(merged["patient_id"].tolist())
    }

    dynamic_names = list(tcn_config["ts_feature_names"])
    if dynamic_names != list(gb_config["ts_mean"].index):
        raise ValueError("TCN and XGBoost telemetry channels/order do not match.")

    static_examples: list[np.ndarray] = []
    dynamic_examples: list[np.ndarray] = []
    gb_static_examples: list[np.ndarray] = []
    windows_raw: list[np.ndarray] = []
    labels_24h: list[float] = []
    labels_48h: list[float] = []
    labels_severity: list[int] = []

    split_telemetry = telemetry[telemetry["patient_id"].isin(patient_ids)]
    for patient_id, group in split_telemetry.groupby("patient_id", sort=False):
        if patient_id not in static_index:
            continue
        group = group.sort_values("timestamp_hour")
        raw = group[dynamic_names].to_numpy(dtype=np.float32)
        hours = group["timestamp_hour"].to_numpy()
        if len(raw) < WINDOW_SIZE:
            continue

        index = static_index[patient_id]
        events = event_map.get(patient_id, [])
        ts_mean = tcn_config["ts_mean"].reindex(dynamic_names).to_numpy()
        ts_std = tcn_config["ts_std"].reindex(dynamic_names).to_numpy()
        for end_index in range(WINDOW_SIZE - 1, len(raw)):
            start_index = end_index - WINDOW_SIZE + 1
            raw_window = raw[start_index : end_index + 1]
            current_hour = int(hours[end_index])
            target_24h = 0.0
            target_48h = 0.0
            target_severity = 0

            for event_start, event_end, severity in events:
                active_now = event_start <= current_hour <= event_end
                if active_now or current_hour < event_start <= current_hour + 24:
                    target_24h = 1.0
                    target_severity = max(target_severity, severity)
                if active_now or current_hour < event_start <= current_hour + 48:
                    target_48h = 1.0
                    target_severity = max(target_severity, severity)

            dynamic_window = (
                (raw_window - ts_mean) / (ts_std + 1e-8)
            ).T.astype(np.float32)
            static_examples.append(tcn_static[index])
            dynamic_examples.append(dynamic_window)
            gb_static_examples.append(gb_static[index])
            windows_raw.append(raw_window)
            labels_24h.append(target_24h)
            labels_48h.append(target_48h)
            labels_severity.append(target_severity)

    if not static_examples:
        raise ValueError("No telemetry windows were generated for this patient split.")

    return (
        np.stack(static_examples),
        np.stack(dynamic_examples),
        build_boosting_features(
            np.stack(gb_static_examples),
            np.stack(windows_raw),
            gb_config,
        ),
        np.asarray(labels_24h, dtype=np.float32),
        np.column_stack(
            [
                np.asarray(labels_48h, dtype=np.float32),
                np.asarray(labels_severity, dtype=np.int64),
            ]
        ),
    )


def _predict_tcn(
    model: DigitalTwinFusionModel,
    static_features: np.ndarray,
    dynamic_features: np.ndarray,
    device: torch.device,
    batch_size: int = 512,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    predictions_24h: list[np.ndarray] = []
    predictions_48h: list[np.ndarray] = []
    predictions_severity: list[np.ndarray] = []
    model.eval()
    with torch.inference_mode():
        for start in range(0, len(static_features), batch_size):
            end = start + batch_size
            static_batch = torch.as_tensor(
                static_features[start:end], dtype=torch.float32, device=device
            )
            dynamic_batch = torch.as_tensor(
                dynamic_features[start:end], dtype=torch.float32, device=device
            )
            logit_24h, logit_48h, logits_severity = model(
                static_batch, dynamic_batch
            )
            predictions_24h.append(torch.sigmoid(logit_24h).cpu().numpy())
            predictions_48h.append(torch.sigmoid(logit_48h).cpu().numpy())
            predictions_severity.append(
                torch.softmax(logits_severity, dim=1).cpu().numpy()
            )
    return (
        np.concatenate(predictions_24h),
        np.concatenate(predictions_48h),
        np.concatenate(predictions_severity),
    )


def _make_meta_features(
    tcn_24h: np.ndarray,
    gb_24h: np.ndarray,
    tcn_48h: np.ndarray,
    gb_48h: np.ndarray,
    tcn_severity: np.ndarray,
    gb_severity: np.ndarray,
) -> np.ndarray:
    return np.column_stack(
        [
            tcn_24h,
            gb_24h,
            tcn_48h,
            gb_48h,
            tcn_severity,
            gb_severity,
        ]
    ).astype(np.float32)


def _collect_meta_split(
    arrays: tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray],
    tcn_model: DigitalTwinFusionModel,
    gb_models: dict[str, Any],
    device: torch.device,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    static_features, dynamic_features, gb_features, labels_24h, labels_other = arrays
    tcn_24h, tcn_48h, tcn_severity = _predict_tcn(
        tcn_model, static_features, dynamic_features, device
    )
    gb_24h = gb_models["model_24h"].predict_proba(gb_features)[:, 1]
    gb_48h = gb_models["model_48h"].predict_proba(gb_features)[:, 1]
    gb_severity = expand_severity_probabilities(
        gb_models["model_sev"], gb_features
    )
    return (
        _make_meta_features(
            tcn_24h,
            positive_class_probability(gb_models["model_24h"], gb_features),
            tcn_48h,
            positive_class_probability(gb_models["model_48h"], gb_features),
            tcn_severity,
            gb_severity,
        ),
        labels_24h,
        labels_other[:, 0].astype(np.float32),
        labels_other[:, 1].astype(np.int64),
    )


def _report_metrics(
    model: RespiTwinMLPMetaLearner,
    x_test: np.ndarray,
    labels_24h: np.ndarray,
    labels_48h: np.ndarray,
    labels_severity: np.ndarray,
    device: torch.device,
) -> dict[str, float]:
    model.eval()
    with torch.inference_mode():
        x_tensor = torch.as_tensor(x_test, dtype=torch.float32, device=device)
        logit_24h, logit_48h, logits_severity = model(x_tensor)
        probability_24h = torch.sigmoid(logit_24h).cpu().numpy()
        probability_48h = torch.sigmoid(logit_48h).cpu().numpy()
        severity_predictions = logits_severity.argmax(dim=1).cpu().numpy()

    return {
        "roc_auc_24h": float(roc_auc_score(labels_24h, probability_24h)),
        "precision_24h_at_0_5": float(
            precision_score(labels_24h, probability_24h >= 0.5, zero_division=0)
        ),
        "recall_24h_at_0_5": float(
            recall_score(labels_24h, probability_24h >= 0.5, zero_division=0)
        ),
        "roc_auc_48h": float(roc_auc_score(labels_48h, probability_48h)),
        "weighted_f1_severity": float(
            f1_score(
                labels_severity,
                severity_predictions,
                average="weighted",
                zero_division=0,
            )
        ),
    }


def train_ensemble() -> dict[str, Any]:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    device_name = torch.cuda.get_device_name(device) if device.type == "cuda" else "CPU"
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    print(f"Training meta-learner on {device_name}")

    with open(TCN_CONFIG_PATH, "rb") as file:
        tcn_config = pickle.load(file)
    with open(GB_CONFIG_PATH, "rb") as file:
        gb_config = pickle.load(file)
    with open(GB_MODEL_PATH, "rb") as file:
        gb_models = pickle.load(file)

    patients = pd.read_csv(PATIENTS_PATH)
    history = pd.read_csv(HISTORY_PATH)
    telemetry = pd.read_csv(TIMESERIES_PATH, sep="\t")
    events_df = pd.read_csv(EVENTS_PATH)

    event_map: dict[str, list[tuple[int, int, int]]] = {}
    for row in events_df.to_dict(orient="records"):
        patient_id = row["patient_id"]
        start = int(row["event_time_hour"])
        duration = int(row.get("duration_hours", 18))
        severity = int(row["severity_score"])
        event_map.setdefault(patient_id, []).append(
            (start, start + duration, severity)
        )

    all_patient_ids = np.unique(
        pd.merge(patients, history, on="patient_id")["patient_id"].to_numpy()
    )
    np.random.shuffle(all_patient_ids)
    train_end = int(0.8 * len(all_patient_ids))
    validation_end = train_end + int(0.1 * len(all_patient_ids))
    train_ids = all_patient_ids[:train_end]
    validation_ids = all_patient_ids[train_end:validation_end]
    test_ids = all_patient_ids[validation_end:]
    if min(len(train_ids), len(validation_ids), len(test_ids)) == 0:
        raise ValueError("Patient-level train/validation/test split is empty.")

    tcn = DigitalTwinFusionModel(
        static_dim=len(tcn_config["static_feature_names"]),
        dynamic_channels=len(tcn_config["ts_feature_names"]),
    ).to(device)
    tcn.load_state_dict(
        torch.load(TCN_MODEL_PATH, map_location=device, weights_only=True),
        strict=True,
    )
    tcn.eval()

    validation_arrays = _get_base_arrays(
        validation_ids,
        patients,
        history,
        telemetry,
        event_map,
        tcn_config,
        gb_config,
    )
    test_arrays = _get_base_arrays(
        test_ids, patients, history, telemetry, event_map, tcn_config, gb_config
    )
    validation_meta, y24_val, y48_val, ysev_val = _collect_meta_split(
        validation_arrays, tcn, gb_models, device
    )
    test_meta, y24_test, y48_test, ysev_test = _collect_meta_split(
        test_arrays, tcn, gb_models, device
    )
    if validation_meta.shape[1] != len(META_INPUT_FEATURES):
        raise ValueError(f"Expected 12 meta-features, got {validation_meta.shape[1]}.")

    meta_model = RespiTwinMLPMetaLearner(
        input_dim=len(META_INPUT_FEATURES)
    ).to(device)
    optimizer = torch.optim.AdamW(
        meta_model.parameters(), lr=1e-3, weight_decay=1e-4
    )
    bce = nn.BCEWithLogitsLoss()
    cross_entropy = nn.CrossEntropyLoss()
    x_val_tensor = torch.as_tensor(
        validation_meta, dtype=torch.float32, device=device
    )
    y24_tensor = torch.as_tensor(y24_val, dtype=torch.float32, device=device)
    y48_tensor = torch.as_tensor(y48_val, dtype=torch.float32, device=device)
    ysev_tensor = torch.as_tensor(ysev_val, dtype=torch.long, device=device)

    generator = torch.Generator(device=device).manual_seed(SEED)
    for epoch in range(20):
        meta_model.train()
        permutation = torch.randperm(
            len(validation_meta), generator=generator, device=device
        )
        total_loss = 0.0
        for indices in permutation.split(512):
            if len(indices) < 2:
                continue
            optimizer.zero_grad(set_to_none=True)
            logit_24h, logit_48h, logits_severity = meta_model(
                x_val_tensor[indices]
            )
            loss = (
                bce(logit_24h, y24_tensor[indices])
                + bce(logit_48h, y48_tensor[indices])
                + cross_entropy(logits_severity, ysev_tensor[indices])
            )
            loss.backward()
            optimizer.step()
            total_loss += float(loss.detach().item())
        if (epoch + 1) % 5 == 0:
            print(f"Epoch {epoch + 1:02d}/20: meta loss={total_loss:.4f}")

    metrics = _report_metrics(
        meta_model, test_meta, y24_test, y48_test, ysev_test, device
    )
    checkpoint_tmp = META_MODEL_PATH.with_suffix(".pt.tmp")
    config_tmp = META_CONFIG_PATH.with_suffix(".json.tmp")
    torch.save(meta_model.state_dict(), checkpoint_tmp)
    config = {
        "version": 1,
        "device": device_name,
        "seed": SEED,
        "window_size_hours": WINDOW_SIZE,
        "train_patient_count": int(len(train_ids)),
        "validation_patient_count": int(len(validation_ids)),
        "test_patient_count": int(len(test_ids)),
        "meta_input_features": META_INPUT_FEATURES,
        "held_out_test_metrics": metrics,
        "base_models": {
            "tcn_checkpoint": str(TCN_MODEL_PATH.relative_to(AASTHMA_DIR)),
            "gradient_boosting_checkpoint": str(
                GB_MODEL_PATH.relative_to(AASTHMA_DIR)
            ),
        },
    }
    config_tmp.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    os.replace(checkpoint_tmp, META_MODEL_PATH)
    os.replace(config_tmp, META_CONFIG_PATH)
    print("Held-out meta-ensemble metrics:")
    for name, value in metrics.items():
        print(f"  {name}: {value:.4f}")
    print(f"Saved meta-model: {META_MODEL_PATH}")
    return config


if __name__ == "__main__":
    train_ensemble()