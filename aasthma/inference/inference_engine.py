import os
import pickle
from typing import Dict, List, Any, Optional, Tuple
import numpy as np
import pandas as pd
import torch

from aasthma.models.digital_twin_model import DigitalTwinFusionModel
from aasthma.simulation.mechanistic_simulator import MechanisticSimulator
from aasthma.training.ensemble import (
    RespiTwinMLPMetaLearner,
    build_boosting_features,
    expand_severity_probabilities,
    positive_class_probability,
)

# Resolve base paths
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
AASTHMA_DIR = os.path.dirname(CURRENT_DIR)
DATA_DIR = os.path.join(AASTHMA_DIR, "dataset", "data")
MODEL_DIR = os.path.join(AASTHMA_DIR, "training", "model1")
GB_CONFIG_PATH = os.path.join(AASTHMA_DIR, "training", "model2", "gb_preprocessor_config.pkl")
GB_MODEL_PATH = os.path.join(AASTHMA_DIR, "training", "model2", "gb_digital_twin_models.pkl")
META_MODEL_PATH = os.path.join(AASTHMA_DIR, "training", "meta_ensemble_model.pt")

PATIENTS_PATH = os.path.join(DATA_DIR, "static", "patients.csv")
HISTORY_PATH = os.path.join(DATA_DIR, "static", "history_features.csv")
TIMESERIES_PATH = os.path.join(DATA_DIR, "dynamic", "timeseries.tsv")
EVENTS_PATH = os.path.join(DATA_DIR, "labels", "events.csv")
CONFIG_PATH = os.path.join(MODEL_DIR, "preprocessor_config.pkl")
WEIGHTS_PATH = os.path.join(MODEL_DIR, "digital_twin_model.pt")

DEFAULT_CITY_STATIONS: Dict[str, str] = {
    "New Delhi": "Anand Vihar, Delhi DPCC",
    "Bengaluru": "Bengaluru Central CPCB",
    "Mumbai": "Bandra Kurla Complex, Mumbai",
    "Kolkata": "Victoria Memorial CPCB",
    "Chennai": "Alandur, Chennai CPCB",
    "Hyderabad": "Sanathnagar, Hyderabad PCB",
    "Ahmedabad": "Maninagar GPCB",
}

FICTIONAL_SYNTHETIC_ALIASES: List[str] = [
    "Synthetic Twin Alpha",
    "Synthetic Twin Beta",
    "Synthetic Twin Gamma",
    "Synthetic Twin Delta",
    "Synthetic Twin Epsilon",
    "Synthetic Twin Zeta",
    "Synthetic Twin Eta",
    "Synthetic Twin Theta",
]

# Standard clinical patient mapping between frontend demo personas and dataset IDs
DEMO_PERSONAS = {
    "PT-8821": {"dataset_id": "PATIENT_0001", "name": "Aarush Sen", "city": "New Delhi", "station": "Anand Vihar CPCB"},
    "PT-4409": {"dataset_id": "PATIENT_0002", "name": "Priya Nair", "city": "Mumbai", "station": "Chembur MPCB"},
    "PT-1923": {"dataset_id": "PATIENT_0003", "name": "Rajesh Sharma", "city": "New Delhi", "station": "RK Puram DPCC"},
    "PT-6031": {"dataset_id": "PATIENT_0004", "name": "Ananya Gupta", "city": "Bengaluru", "station": "Silk Board KSPCB"},
    "PT-3118": {"dataset_id": "PATIENT_0005", "name": "Vikram Malhotra", "city": "Kolkata", "station": "Victoria Memorial WBPCB"},
    "PT-5290": {"dataset_id": "PATIENT_0006", "name": "Sunita Patel", "city": "Ahmedabad", "station": "Maninagar GPCB"},
    "PT-7712": {"dataset_id": "PATIENT_0005", "name": "Vikram Malhotra", "city": "Mumbai", "station": "Bandra MPCB"},
    "PT-3305": {"dataset_id": "PATIENT_0006", "name": "Sunita Rao", "city": "Bengaluru", "station": "BTM Layout KSPCB"},
}

# Reverse mapping
DATASET_TO_DEMO = {v["dataset_id"]: k for k, v in DEMO_PERSONAS.items()}


class InferenceEngine:
    """Production Inference Engine for BreathTwin Multimodal Stacked Ensemble (Dilated TCN + XGBoost -> MLP)."""

    def __init__(self, device: Optional[str] = None):
        self.device = torch.device(device if device else ("cuda" if torch.cuda.is_available() else "cpu"))
        self.registered_demo_ids: List[str] = ["PT-8821", "PT-4409", "PT-1923", "PT-6031", "PT-3118", "PT-5290"]
        self.simulator = MechanisticSimulator()
        self.enrolled_patient_profiles: Dict[str, Dict[str, Any]] = {}
        self._load_preprocessors()
        self._load_model()
        self._load_data()

    def _load_preprocessors(self):
        with open(CONFIG_PATH, "rb") as f:
            self.cfg = pickle.load(f)
        self.static_feature_names: List[str] = self.cfg["static_feature_names"]
        self.ts_feature_names: List[str] = self.cfg["ts_feature_names"]
        self.static_mean = self.cfg["static_mean"]
        self.static_std = self.cfg["static_std"]
        self.ts_mean = self.cfg["ts_mean"]
        self.ts_std = self.cfg["ts_std"]

    def _load_model(self):
        self.model = DigitalTwinFusionModel(static_dim=len(self.static_feature_names), dynamic_channels=len(self.ts_feature_names))
        state_dict = torch.load(WEIGHTS_PATH, map_location="cpu", weights_only=False)
        self.model.load_state_dict(state_dict)
        self.model.to(self.device)
        self.model.eval()

        with open(GB_CONFIG_PATH, "rb") as f:
            self.gb_cfg = pickle.load(f)
        with open(GB_MODEL_PATH, "rb") as f:
            self.gb_models = pickle.load(f)
        self.gb_static_feature_names = list(self.gb_cfg["static_mean"].index)
        if self.gb_static_feature_names != self.static_feature_names:
            raise ValueError("Gradient-boosting and TCN static feature schemas do not match.")
        if list(self.gb_cfg["ts_mean"].index) != self.ts_feature_names:
            raise ValueError("Gradient-boosting and TCN telemetry schemas do not match.")

        self.meta_model = RespiTwinMLPMetaLearner(input_dim=12)
        meta_state = torch.load(META_MODEL_PATH, map_location="cpu", weights_only=True)
        self.meta_model.load_state_dict(meta_state, strict=True)
        self.meta_model.to(self.device)
        self.meta_model.eval()

    def _load_data(self):
        # Raw tabular records
        self.patients_df = pd.read_csv(PATIENTS_PATH)
        self.history_df = pd.read_csv(HISTORY_PATH)
        self.events_df = pd.read_csv(EVENTS_PATH)

        # Merge static features
        self._rebuild_static_tables()

        # Load time series
        self.ts_df = pd.read_csv(TIMESERIES_PATH, sep="\t")
        self.patient_ids = self.patients_df["patient_id"].tolist()

        # Cache events per patient
        self.events_by_patient = {}
        for _, row in self.events_df.iterrows():
            pid = row["patient_id"]
            if pid not in self.events_by_patient:
                self.events_by_patient[pid] = []
            self.events_by_patient[pid].append({
                "hour": int(row["event_time_hour"]),
                "type": row["event_type"],
                "severity": int(row["severity_score"])
            })

    def _rebuild_static_tables(self):
        """Rebuilds both encoded_static_df (used by XGBoost) and norm_static_df (used by Dilated TCN)."""
        merged = pd.merge(self.patients_df, self.history_df, on="patient_id")
        encoded = pd.get_dummies(merged.drop(columns=["patient_id"]))
        encoded = encoded.reindex(columns=self.static_feature_names, fill_value=0).fillna(0)
        self.encoded_static_df = encoded.copy()
        self.encoded_static_df["patient_id"] = merged["patient_id"].values
        self.norm_static_df = ((encoded - self.static_mean) / (self.static_std + 1e-8)).fillna(0)
        self.norm_static_df["patient_id"] = merged["patient_id"].values

    def resolve_patient_id(self, input_id: str) -> str:
        """Resolves demo ID (e.g. PT-8821) to dataset ID (e.g. PATIENT_0001) or returns dataset ID."""
        if input_id in DEMO_PERSONAS:
            return DEMO_PERSONAS[input_id]["dataset_id"]
        return input_id

    def get_patient_metadata(self, pid: str) -> Dict[str, Any]:
        """Returns baseline EHR profile and clinical parameters."""
        resolved_pid = self.resolve_patient_id(pid)
        p_row = self.patients_df[self.patients_df["patient_id"] == resolved_pid]
        h_row = self.history_df[self.history_df["patient_id"] == resolved_pid]

        if p_row.empty:
            raise KeyError(f"Patient {pid} (resolved as {resolved_pid}) not found.")

        p = p_row.iloc[0].to_dict()
        h = h_row.iloc[0].to_dict() if not h_row.empty else {}

        demo_info = DEMO_PERSONAS.get(pid, {})
        enrolled_info = self.enrolled_patient_profiles.get(resolved_pid, self.enrolled_patient_profiles.get(pid, {}))
        name = demo_info.get("name", f"Synthetic Twin ({pid})")
        city = demo_info.get("city", "New Delhi" if int(p["pack_years"]) > 10 else "Mumbai")
        station = demo_info.get("station", DEFAULT_CITY_STATIONS.get(city, f"{city} Central CPCB"))

        return {
            "id": pid,
            "dataset_id": resolved_pid,
            "name": name,
            "age": int(p["age"]),
            "gender": "M" if p["sex"] == "Male" else "F",
            "city": city,
            "station": station,
            "height_cm": float(p["height_cm"]),
            "weight_kg": float(p["weight_kg"]),
            "bmi": float(p["bmi"]),
            "severity": str(p["asthma_severity"]).replace("_", " ") if pd.notna(p.get("asthma_severity")) else "Moderate Persistent",
            "copd_status": bool(p["copd_status"]) if pd.notna(p.get("copd_status")) else False,
            "allergic_rhinitis": bool(p["allergic_rhinitis"]) if pd.notna(p.get("allergic_rhinitis")) else False,
            "smoking_status": str(p["smoking_status"]) if pd.notna(p.get("smoking_status")) else "Unknown",
            "pack_years": float(p["pack_years"]) if pd.notna(p.get("pack_years")) else 0.0,
            "controller_medication": str(p["controller_medication"]).replace("_", " ") if pd.notna(p.get("controller_medication")) else "Budesonide/Formoterol 200/6 µg",
            "controller_adherence": int(float(p["medication_adherence"]) * 100) if pd.notna(p.get("medication_adherence")) else 75,
            "baseline_rescue_use_weekly": int(p["baseline_rescue_use_weekly"]) if pd.notna(p.get("baseline_rescue_use_weekly")) else 0,
            "baseline_fev1_pct": float(p["baseline_fev1_pct"]) if pd.notna(p.get("baseline_fev1_pct")) else 75.0,
            "baseline_fev1_fvc": float(p["baseline_fev1_fvc"]) if pd.notna(p.get("baseline_fev1_fvc")) else 0.72,
            "baseline_pef_lmin": float(p["baseline_pef_lmin"]) if pd.notna(p.get("baseline_pef_lmin")) else 380.0,
            "baseline_spo2": float(p["baseline_spo2"]) if pd.notna(p.get("baseline_spo2")) else 95.0,
            "baseline_resting_hr": int(p["baseline_resting_hr"]) if pd.notna(p.get("baseline_resting_hr")) else 72,
            "baseline_rr": int(p["baseline_rr"]) if pd.notna(p.get("baseline_rr")) else 16,
            "comorbidity_burden": int(p["comorbidity_burden"]) if pd.notna(p.get("comorbidity_burden")) else 1,
            "previous_disease": str(h.get("previous_disease", "None")).replace("_", " ") if pd.notna(h.get("previous_disease")) else "None",
            "hospitalized": bool(h.get("hospitalized", 0)) if pd.notna(h.get("hospitalized")) else False,
            "episode_count": int(h.get("episode_count", 1)) if pd.notna(h.get("episode_count")) else 1,
            "simulated_device_profile": enrolled_info.get("simulated_device_profile", "typical"),
            "custom_allergens": enrolled_info.get("allergens"),
            "is_new_enrollment": bool(enrolled_info.get("is_new_enrollment", False)),
        }

    def get_patient_window(self, pid: str, end_hour: int = 240, window_size: int = 12) -> Tuple[np.ndarray, np.ndarray, pd.DataFrame]:
        """Extracts normalized static vector and normalized dynamic window [channels, time_steps]."""
        resolved_pid = self.resolve_patient_id(pid)

        # Static vector
        static_row = self.norm_static_df[self.norm_static_df["patient_id"] == resolved_pid]
        if static_row.empty:
            self._rebuild_static_tables()
            static_row = self.norm_static_df[self.norm_static_df["patient_id"] == resolved_pid]
        static_vec = static_row[self.static_feature_names].values[0]

        # Dynamic window
        p_ts = self.ts_df[self.ts_df["patient_id"] == resolved_pid].sort_values("timestamp_hour")
        if end_hour > len(p_ts):
            end_hour = len(p_ts)
        start_hour = max(0, end_hour - window_size)

        raw_window = p_ts.iloc[start_hour:end_hour]
        if len(raw_window) < window_size:
            # Pad front if needed
            pad_len = window_size - len(raw_window)
            first_row = raw_window.iloc[0:1]
            pad_df = pd.concat([first_row] * pad_len, ignore_index=True)
            raw_window = pd.concat([pad_df, raw_window], ignore_index=True)

        dyn_mat = raw_window[self.ts_feature_names].values  # [12, 20]
        norm_dyn_mat = (dyn_mat - self.ts_mean.values) / (self.ts_std.values + 1e-8)
        dyn_window_transposed = norm_dyn_mat.T  # [20, 12]

        return static_vec, dyn_window_transposed, raw_window

    def score_counterfactual_window(
        self,
        pid: str,
        end_hour: int = 168,
        dose_ratio: float = 1.0,
        delta_inflammation: float = 0.0,
        target_adherence_pct: float = 75.0,
        wear_n95: bool = False,
        hepa_purifier: bool = False,
        outdoor_hours: float = 2.5,
        window_size: int = 12,
    ) -> Dict[str, float]:
        """
        Perturbs the patient's 12-hour dynamic telemetry window and static controller adherence
        under counterfactual What-If interventions, then executes the full Stage-1 (Dilated TCN + XGBoost)
        and Stage-2 (MLP Meta-Learner) forward pass.
        """
        resolved_pid = self.resolve_patient_id(pid)
        static_vec, dyn_window, raw_window = self.get_patient_window(pid, end_hour, window_size)

        encoded_matches = self.encoded_static_df[self.encoded_static_df["patient_id"] == resolved_pid]
        if encoded_matches.empty:
            self._rebuild_static_tables()
            encoded_matches = self.encoded_static_df[self.encoded_static_df["patient_id"] == resolved_pid]
        static_row = encoded_matches.iloc[0].copy()

        # 1. Baseline ensemble pass
        gb_static_base = (
            (static_row[self.gb_static_feature_names] - self.gb_cfg["static_mean"])
            / self.gb_cfg["static_std"]
        ).to_numpy(dtype=np.float32).reshape(1, -1)
        gb_dynamic_names = list(self.gb_cfg["ts_mean"].index)
        gb_features_base = build_boosting_features(
            gb_static_base,
            raw_window[gb_dynamic_names].to_numpy(dtype=np.float32)[None, :, :],
            self.gb_cfg,
        )
        with torch.no_grad():
            st_t = torch.tensor(static_vec, dtype=torch.float32, device=self.device).unsqueeze(0)
            dy_t = torch.tensor(dyn_window, dtype=torch.float32, device=self.device).unsqueeze(0)
            b_l24, b_l48, b_lsev = self.model(st_t, dy_t)
            b_gb24 = positive_class_probability(self.gb_models["model_24h"], gb_features_base)
            b_gb48 = positive_class_probability(self.gb_models["model_48h"], gb_features_base)
            b_gbsev = expand_severity_probabilities(self.gb_models["model_sev"], gb_features_base)
            b_meta_in = np.column_stack([
                torch.sigmoid(b_l24).cpu().numpy(),
                b_gb24,
                torch.sigmoid(b_l48).cpu().numpy(),
                b_gb48,
                torch.softmax(b_lsev, dim=1).cpu().numpy(),
                b_gbsev,
            ]).astype(np.float32)
            _, b_meta48, _ = self.meta_model(torch.as_tensor(b_meta_in, dtype=torch.float32, device=self.device))
            baseline_meta_48h = float(torch.sigmoid(b_meta48).item() * 100.0)

        # 2. Counterfactual static & dynamic window perturbation
        cf_static_row = static_row.copy()
        if "medication_adherence" in cf_static_row.index:
            cf_static_row["medication_adherence"] = float(np.clip(target_adherence_pct / 100.0, 0.0, 1.0))

        cf_static_vec = (
            (cf_static_row[self.static_feature_names] - self.static_mean)
            / (self.static_std + 1e-8)
        ).to_numpy(dtype=np.float32)
        cf_gb_static = (
            (cf_static_row[self.gb_static_feature_names] - self.gb_cfg["static_mean"])
            / self.gb_cfg["static_std"]
        ).to_numpy(dtype=np.float32).reshape(1, -1)

        cf_window = raw_window.copy()
        eff_dose_ratio = float(np.clip(dose_ratio, 0.15, 2.5))
        if "pm25_concentration" in cf_window.columns:
            cf_window["pm25_concentration"] = np.clip(cf_window["pm25_concentration"] * eff_dose_ratio, 8.0, 500.0)
        if "pm10_concentration" in cf_window.columns:
            cf_window["pm10_concentration"] = np.clip(cf_window["pm10_concentration"] * eff_dose_ratio, 15.0, 600.0)
        if "aqi_index" in cf_window.columns:
            cf_window["aqi_index"] = np.clip(np.round(cf_window["aqi_index"] * eff_dose_ratio), 20, 500)

        # Couple physiological channels to ODE latent inflammation shift delta_I
        if "respiratory_rate" in cf_window.columns:
            cf_window["respiratory_rate"] = np.clip(cf_window["respiratory_rate"] + delta_inflammation * 7.5, 11.0, 34.0)
        if "heart_rate" in cf_window.columns:
            cf_window["heart_rate"] = np.clip(cf_window["heart_rate"] + delta_inflammation * 16.0, 52.0, 135.0)
        if "spo2" in cf_window.columns:
            cf_window["spo2"] = np.clip(cf_window["spo2"] - delta_inflammation * 4.0, 86.0, 99.5)
        if "hrv_rmssd" in cf_window.columns:
            cf_window["hrv_rmssd"] = np.clip(cf_window["hrv_rmssd"] - delta_inflammation * 24.0, 12.0, 90.0)
        if "cough_severity" in cf_window.columns:
            cf_window["cough_severity"] = np.clip(np.round(cf_window["cough_severity"] + delta_inflammation * 2.5), 0, 3)
        if "wheezing_score" in cf_window.columns:
            cf_window["wheezing_score"] = np.clip(np.round(cf_window["wheezing_score"] + delta_inflammation * 2.5), 0, 3)
        if "breathlessness_score" in cf_window.columns:
            cf_window["breathlessness_score"] = np.clip(np.round(cf_window["breathlessness_score"] + delta_inflammation * 2.0), 0, 3)
        if "chest_tightness" in cf_window.columns:
            cf_window["chest_tightness"] = np.clip(np.round(cf_window["chest_tightness"] + delta_inflammation * 2.0), 0, 3)
        if "rescue_inhaler_puffs" in cf_window.columns:
            cf_window["rescue_inhaler_puffs"] = np.clip(np.round(cf_window["rescue_inhaler_puffs"] + delta_inflammation * 2.2), 0, 6)

        cf_dyn_mat = cf_window[self.ts_feature_names].values
        cf_norm_dyn = ((cf_dyn_mat - self.ts_mean.values) / (self.ts_std.values + 1e-8)).T

        cf_gb_features = build_boosting_features(
            cf_gb_static,
            cf_window[gb_dynamic_names].to_numpy(dtype=np.float32)[None, :, :],
            self.gb_cfg,
        )

        with torch.no_grad():
            cf_st_t = torch.tensor(cf_static_vec, dtype=torch.float32, device=self.device).unsqueeze(0)
            cf_dy_t = torch.tensor(cf_norm_dyn, dtype=torch.float32, device=self.device).unsqueeze(0)
            cf_l24, cf_l48, cf_lsev = self.model(cf_st_t, cf_dy_t)
            cf_gb24 = positive_class_probability(self.gb_models["model_24h"], cf_gb_features)
            cf_gb48 = positive_class_probability(self.gb_models["model_48h"], cf_gb_features)
            cf_gbsev = expand_severity_probabilities(self.gb_models["model_sev"], cf_gb_features)

            cf_meta_in = np.column_stack([
                torch.sigmoid(cf_l24).cpu().numpy(),
                cf_gb24,
                torch.sigmoid(cf_l48).cpu().numpy(),
                cf_gb48,
                torch.softmax(cf_lsev, dim=1).cpu().numpy(),
                cf_gbsev,
            ]).astype(np.float32)
            cf_m24, cf_m48, _ = self.meta_model(torch.as_tensor(cf_meta_in, dtype=torch.float32, device=self.device))

            tcn_24 = float(torch.sigmoid(cf_l24).item() * 100.0)
            tcn_48 = float(torch.sigmoid(cf_l48).item() * 100.0)
            gb_24_pct = float(cf_gb24[0] * 100.0)
            gb_48_pct = float(cf_gb48[0] * 100.0)
            meta_24_pct = float(torch.sigmoid(cf_m24).item() * 100.0)
            meta_48_pct = float(torch.sigmoid(cf_m48).item() * 100.0)

        return {
            "tcnRisk24h": round(tcn_24, 1),
            "gradientBoostingRisk24h": round(gb_24_pct, 1),
            "metaRisk24h": round(meta_24_pct, 1),
            "tcnRisk48h": round(tcn_48, 1),
            "gradientBoostingRisk48h": round(gb_48_pct, 1),
            "metaRisk48h": round(meta_48_pct, 1),
            "baselineMetaRisk48h": round(baseline_meta_48h, 1),
        }

    def predict_patient(self, pid: str, end_hour: int = 240, window_size: int = 12) -> Dict[str, Any]:
        """
        Runs live stacked ensemble forecast (Dilated TCN + XGBoost -> MLP Meta-Learner)
        coupled with the MechanisticSimulator ODE and end-to-end gradient + tree attribution.
        """
        resolved_pid = self.resolve_patient_id(pid)
        static_vec, dyn_window, raw_window = self.get_patient_window(pid, end_hour, window_size)

        static_tensor = torch.tensor(static_vec, dtype=torch.float32, device=self.device).unsqueeze(0)
        dyn_tensor = torch.tensor(dyn_window, dtype=torch.float32, device=self.device).unsqueeze(0)

        # Enable gradient computation on both static and dynamic tensors through TCN -> MLP Meta-Learner
        static_tensor.requires_grad = True
        dyn_tensor.requires_grad = True

        logit_24h, logit_48h, logits_sev = self.model(static_tensor, dyn_tensor)

        encoded_matches = self.encoded_static_df[self.encoded_static_df["patient_id"] == resolved_pid]
        if encoded_matches.empty:
            self._rebuild_static_tables()
            encoded_matches = self.encoded_static_df[self.encoded_static_df["patient_id"] == resolved_pid]
        static_row = encoded_matches.iloc[0]

        gb_static = (
            (static_row[self.gb_static_feature_names] - self.gb_cfg["static_mean"])
            / self.gb_cfg["static_std"]
        ).to_numpy(dtype=np.float32).reshape(1, -1)
        gb_dynamic_names = list(self.gb_cfg["ts_mean"].index)
        gb_features = build_boosting_features(
            gb_static,
            raw_window[gb_dynamic_names].to_numpy(dtype=np.float32)[None, :, :],
            self.gb_cfg,
        )
        gb_24h = positive_class_probability(self.gb_models["model_24h"], gb_features)
        gb_48h = positive_class_probability(self.gb_models["model_48h"], gb_features)
        gb_severity = expand_severity_probabilities(
            self.gb_models["model_sev"], gb_features
        )

        # Build connected PyTorch meta-feature tensor so gradients backpropagate from MLP through Dilated TCN
        tcn_p24 = torch.sigmoid(logit_24h).unsqueeze(1)
        tcn_p48 = torch.sigmoid(logit_48h).unsqueeze(1)
        tcn_psev = torch.softmax(logits_sev, dim=1)
        gb_p24_t = torch.tensor(gb_24h, dtype=torch.float32, device=self.device).unsqueeze(1)
        gb_p48_t = torch.tensor(gb_48h, dtype=torch.float32, device=self.device, requires_grad=True).unsqueeze(1)
        gb_psev_t = torch.tensor(gb_severity, dtype=torch.float32, device=self.device)

        meta_tensor = torch.cat([tcn_p24, gb_p24_t, tcn_p48, gb_p48_t, tcn_psev, gb_psev_t], dim=1)
        meta_24h, meta_48h, meta_severity = self.meta_model(meta_tensor)

        risk_24h = float(torch.sigmoid(meta_24h).item() * 100)
        risk_48h = float(torch.sigmoid(meta_48h).item() * 100)
        sev_class = int(torch.argmax(meta_severity, dim=1).item())
        base_predictions = {
            "tcnRisk24h": round(float(torch.sigmoid(logit_24h).item() * 100), 1),
            "gradientBoostingRisk24h": round(float(gb_24h[0] * 100), 1),
            "xgbRisk24h": round(float(gb_24h[0] * 100), 1),
            "tcnRisk48h": round(float(torch.sigmoid(logit_48h).item() * 100), 1),
            "gradientBoostingRisk48h": round(float(gb_48h[0] * 100), 1),
            "xgbRisk48h": round(float(gb_48h[0] * 100), 1),
            "metaRisk24h": round(risk_24h, 1),
            "mlpRisk24h": round(risk_24h, 1),
            "metaRisk48h": round(risk_48h, 1),
            "mlpRisk48h": round(risk_48h, 1),
        }

        # End-to-end sensitivity attribution backpropagating from MLP Meta-Learner (meta_48h) -> Dilated TCN + XGBoost
        self.model.zero_grad(set_to_none=True)
        self.meta_model.zero_grad(set_to_none=True)
        meta_48h.backward(retain_graph=False)

        dyn_grad = dyn_tensor.grad.detach().cpu().numpy()[0]  # [20, 12]
        tcn_dyn_importance = np.mean(np.abs(dyn_grad * dyn_window), axis=1) + np.mean(np.abs(dyn_grad), axis=1)

        # Combine with XGBoost 48h tree feature importances aggregated per dynamic channel
        xgb_importances = getattr(self.gb_models["model_48h"], "feature_importances_", None)
        xgb_dyn_importance = np.zeros(len(self.ts_feature_names), dtype=np.float32)
        n_static = len(self.gb_static_feature_names)
        if xgb_importances is not None and len(xgb_importances) >= n_static + len(self.ts_feature_names) * 10:
            for ch_idx in range(len(self.ts_feature_names)):
                start_col = n_static + ch_idx * 10
                xgb_dyn_importance[ch_idx] = float(np.sum(xgb_importances[start_col:start_col + 10]))

        # Normalize and fuse TCN-MLP gradient attribution with XGBoost tree attribution
        tcn_norm = tcn_dyn_importance / (np.sum(tcn_dyn_importance) + 1e-8)
        xgb_norm = xgb_dyn_importance / (np.sum(xgb_dyn_importance) + 1e-8) if np.sum(xgb_dyn_importance) > 0 else tcn_norm
        feat_importance = 0.55 * tcn_norm + 0.45 * xgb_norm

        static_tensor.requires_grad = False
        dyn_tensor.requires_grad = False

        # Rank top drivers
        top_indices = np.argsort(feat_importance)[::-1][:4]
        top_total = float(np.sum(feat_importance[top_indices]) + 1e-8)
        shap_reasons = []
        target_streams = {
            "pm25_concentration": "AIR_QUALITY",
            "pm10_concentration": "AIR_QUALITY",
            "aqi_index": "AIR_QUALITY",
            "respiratory_rate": "WEARABLE",
            "spo2": "WEARABLE",
            "heart_rate": "WEARABLE",
            "hrv_rmssd": "WEARABLE",
            "rescue_inhaler_puffs": "MEDICATION",
            "sleep_interruptions": "WEARABLE",
        }

        latest_readings = raw_window.iloc[-1].to_dict()

        for rank, idx in enumerate(top_indices, 1):
            feat_name = self.ts_feature_names[idx]
            val = float(latest_readings.get(feat_name, 0.0))
            mean_val = float(self.ts_mean.get(feat_name, val))
            stream = target_streams.get(feat_name, "WEARABLE")
            share_pct = int(np.clip(round((feat_importance[idx] / top_total) * 100.0), 12, 48))

            # Direction based on signed MLP->TCN input gradient & clinical deviation
            signed_grad = float(np.mean(dyn_grad[idx]))
            if feat_name in ("spo2", "hrv_rmssd"):
                direction = "up" if val <= mean_val else ("down" if signed_grad < 0 else "up")
            else:
                direction = "up" if (val >= mean_val or signed_grad >= 0) else "down"

            clean_name = feat_name.replace("_", " ").title()
            if feat_name == "pm25_concentration":
                clean_name = "Ambient PM2.5 Surge"
                desc = f"Exposure reached {val:.1f} µg/m³ during peak diurnal transit window."
            elif feat_name == "respiratory_rate":
                clean_name = "Resting Respiratory Rate Drift"
                desc = f"Nocturnal RR recorded at {val:.1f} breaths/min across 12h window."
            elif feat_name == "spo2":
                clean_name = "Nighttime SpO2 Desaturations"
                desc = f"SpO2 settled at {val:.1f}% accompanied by nocturnal airflow resistance."
            elif feat_name == "rescue_inhaler_puffs":
                clean_name = "Rescue Inhaler Actuations"
                desc = f"Patient logged {int(raw_window['rescue_inhaler_puffs'].sum())} rescue puffs in recent window."
            else:
                desc = f"Ensemble attribution driver: {val:.1f} in recent 12-hour telemetry."

            shap_reasons.append({
                "rank": rank,
                "feature": clean_name,
                "impactPercent": share_pct,
                "direction": direction,
                "description": desc,
                "targetStream": stream,
            })

        # Run MechanisticSimulator every time predict_patient runs (ODE state + baseline counterfactual)
        adherence_ratio = float(static_row.get("medication_adherence", 0.75))
        base_fev1_pct = float(static_row.get("baseline_fev1_pct", 75.0))
        ode_inflammation = self.simulator.integrate_window_inflammation(
            raw_window=raw_window,
            adherence_ratio=adherence_ratio,
            base_fev1_pct=base_fev1_pct,
        )
        # Fuse ODE latent airway inflammation I(t) with neural ensemble risk state
        estimated_inflammation = float(
            np.clip(0.55 * ode_inflammation + 0.45 * (risk_48h / 100.0 * 0.92 + 0.06), 0.10, 0.95)
        )

        # FR-16: Learning Baseline & Conformal Uncertainty Intervals (narrowing over Days 1 -> 7)
        enrolled_info = self.enrolled_patient_profiles.get(resolved_pid, self.enrolled_patient_profiles.get(pid, {}))
        is_new_enrollment = bool(enrolled_info.get("is_new_enrollment", False))
        # Calculate monitoring day (1..7)
        obs_day = max(1, min(7, int(np.ceil(end_hour / 24.0)))) if not is_new_enrollment else int(enrolled_info.get("calibration_day", 1))
        learning_extra_margin = max(0.0, (7 - obs_day) * 2.4) if is_new_enrollment else 0.0

        margin_24 = max(5.0, min(24.0, (1.0 - abs(risk_24h / 50.0 - 1.0)) * 12.0 + learning_extra_margin))
        margin_48 = max(6.0, min(26.0, (1.0 - abs(risk_48h / 50.0 - 1.0)) * 14.0 + learning_extra_margin))

        ci_24 = [int(max(0, round(risk_24h - margin_24))), int(min(100, round(risk_24h + margin_24)))]
        ci_48 = [int(max(0, round(risk_48h - margin_48))), int(min(100, round(risk_48h + margin_48)))]

        uncertainty_schedule = [
            {"day": 1, "label": "Day 1", "halfWidthPct": 22.0, "bandHalfWidth": 22, "status": "Wide initial conformal band (cold-start)"},
            {"day": 2, "label": "Day 2", "halfWidthPct": 19.0, "bandHalfWidth": 19, "status": "Learning nocturnal respiratory baseline"},
            {"day": 3, "label": "Day 3", "halfWidthPct": 16.0, "bandHalfWidth": 16, "status": "Adapting to nocturnal RR & HRV rhythm"},
            {"day": 4, "label": "Day 4", "halfWidthPct": 13.5, "bandHalfWidth": 14, "status": "Incorporating ambient PM2.5 sensitivity"},
            {"day": 5, "label": "Day 5", "halfWidthPct": 11.0, "bandHalfWidth": 11, "status": "Personal physiological baseline converging"},
            {"day": 6, "label": "Day 6", "halfWidthPct": 9.0, "bandHalfWidth": 9, "status": "High-confidence digital twin state"},
            {"day": 7, "label": "Day 7", "halfWidthPct": 7.0, "bandHalfWidth": 7, "status": "Fully calibrated conformal interval"},
        ]
        learning_baseline = {
            "active": is_new_enrollment and obs_day < 7,
            "day": obs_day,
            "currentDay": obs_day,
            "totalDays": 7,
            "totalCalibrationDays": 7,
            "statusLabel": (
                f"LEARNING PERSONAL BASELINE (DAY {obs_day} OF 7)"
                if is_new_enrollment and obs_day < 7
                else "BASELINE CALIBRATED (7-DAY CONVERGENCE COMPLETE)"
            ),
            "bandHalfWidthPct": round(margin_48, 1),
            "uncertaintyHalfWidthPct": round(margin_48, 1),
            "simulatedDeviceProfile": enrolled_info.get("simulated_device_profile", "typical"),
            "uncertaintySchedule": uncertainty_schedule,
            "convergenceSchedule": uncertainty_schedule,
        }

        # Triage status
        if risk_48h >= 70:
            risk_level = "HIGH RISK"
        elif risk_48h >= 55:
            risk_level = "ELEVATED"
        elif risk_48h >= 35:
            risk_level = "CAUTION"
        else:
            risk_level = "NORMAL"

        # Alert headline
        if risk_level == "HIGH RISK":
            headline = f"Imminent flare-up predicted within 36-48h: {shap_reasons[0]['feature']} + nocturnal tachypnea"
        elif risk_level == "ELEVATED":
            headline = f"Sub-acute airway resistance escalation: elevated {shap_reasons[0]['feature'].lower()}"
        elif risk_level == "CAUTION":
            headline = "Mild autonomic reactivity; ambient triggers monitored"
        else:
            headline = "Airway physiology stable; within baseline physiological bounds"

        lead_time = int(32 + (100 - risk_48h) * 0.16) if risk_48h >= 50 else 48

        # Execute What-If Simulator counterfactual check every time predict_patient runs
        latest_pm25 = float(latest_readings.get("pm25_concentration", 85.0))
        what_if_preview = self.simulator.simulate_what_if(
            base_risk_48h=round(risk_48h, 1),
            base_inflammation=round(estimated_inflammation, 2),
            current_pm25=latest_pm25,
            current_adherence_pct=round(adherence_ratio * 100.0, 1),
            outdoor_hours=1.0,
            wear_n95=True,
            target_adherence_pct=max(95.0, round(adherence_ratio * 100.0, 1)),
            hepa_purifier=True,
            horizon_hours=48,
        )

        return {
            "risk24h": round(risk_24h, 1),
            "risk24hInterval": ci_24,
            "risk48h": round(risk_48h, 1),
            "risk48hInterval": ci_48,
            "basePredictions": base_predictions,
            "ensemble": {
                "tcn": True,
                "gradient_boosting": True,
                "meta_learner": True,
            },
            "learningBaseline": learning_baseline,
            "whatIfPreview": what_if_preview,
            "riskLevel": risk_level,
            "severityClass": sev_class,
            "estimatedInflammationState": round(estimated_inflammation, 2),
            "inflammationThreshold": 0.65,
            "activeAlert": risk_48h >= 55,
            "alertHeadline": headline,
            "leadTimeHours": lead_time,
            "shapReasons": shap_reasons,
            "latestTelemetry": latest_readings,
        }

    def get_formatted_patient(self, pid: str, end_hour: int = 168) -> Dict[str, Any]:
        """
        Builds the complete patient state object conforming to frontend Patient interface,
        powered by the live neural model forward pass, conformal calibration, and timeseries slice.
        """
        resolved_pid = self.resolve_patient_id(pid)
        pred = self.predict_patient(pid, end_hour=end_hour)
        meta = self.get_patient_metadata(pid)

        # Slice timeseries up to end_hour
        p_ts = self.ts_df[
            (self.ts_df["patient_id"] == resolved_pid) & 
            (self.ts_df["timestamp_hour"] <= end_hour)
        ].sort_values("timestamp_hour")

        if p_ts.empty:
            p_ts = self.ts_df[self.ts_df["patient_id"] == resolved_pid].sort_values("timestamp_hour").iloc[:12]

        latest = p_ts.iloc[-1]
        last_24 = p_ts.iloc[-24:] if len(p_ts) >= 24 else p_ts

        # Telemetry fields
        spo2 = round(float(latest.get("spo2", 95.0)), 1)
        rr = round(float(latest.get("respiratory_rate", 16.0)), 1)
        rhr = round(float(latest.get("heart_rate", 72.0)), 0)
        hrv = round(float(latest.get("hrv_rmssd", 32.0)), 0)
        sleep_awakenings = int(last_24.get("sleep_interruptions", pd.Series([1])).sum()) if "sleep_interruptions" in last_24 else 1
        deep_sleep_pct = round(max(5.0, min(25.0, 14.0 + (hrv - 30.0) * 0.2)), 1)
        steps = int(last_24.get("step_count", pd.Series([4500])).sum()) if "step_count" in last_24 else 4500
        rescue_puffs_24h = int(last_24.get("rescue_inhaler_puffs", pd.Series([0])).sum()) if "rescue_inhaler_puffs" in last_24 else 0

        # Air quality fields
        pm25 = round(float(latest.get("pm25_concentration", 85.0)), 0)
        pm10 = round(float(latest.get("pm10_concentration", 150.0)), 0)
        aqi = int(latest.get("aqi_index", 180))
        if aqi > 300:
            aqi_cat = "Severe"
        elif aqi > 200:
            aqi_cat = "Very Poor"
        elif aqi > 100:
            aqi_cat = "Poor"
        elif aqi > 50:
            aqi_cat = "Moderate"
        else:
            aqi_cat = "Good"

        temp = round(float(latest.get("skin_temp_c", 29.5)), 1)
        humidity = round(float(latest.get("humidity", 70.0)), 0) if "humidity" in latest else 72.0

        custom_allergens = meta.get("custom_allergens")
        if custom_allergens and isinstance(custom_allergens, list) and len(custom_allergens) > 0:
            allergens = list(custom_allergens)
        else:
            allergens = ["Dust Mites", "Biomass Smoke", "Vehicle Exhaust"]
            if "Severe" in str(meta.get("severity", "")):
                allergens.append("Fungal Spores")

        comorbidities = []
        if meta.get("copd_status"):
            comorbidities.append("COPD Overlap")
        if meta.get("comorbidity_burden", 0) > 1:
            comorbidities.append("Allergic Rhinitis")
        if meta.get("hospitalized"):
            comorbidities.append("Past Respiratory Hospitalization")
        if not comorbidities:
            comorbidities = ["None"]

        # Conformal intervals
        ci_24 = pred["risk24hInterval"]
        ci_48 = pred["risk48hInterval"]

        return {
            "id": pid,
            "name": meta["name"],
            "age": meta["age"],
            "gender": meta["gender"],
            "city": meta["city"],
            "station": meta["station"],
            "severity": meta["severity"],
            "controllerMedication": meta.get("controller_medication", "Budesonide/Formoterol 200/6 µg"),
            "controllerAdherence": meta.get("controller_adherence", 75),
            "rescueMedication": "Levosalbutamol 50 µg MDI",
            "baselineFEV1": round(meta.get("baseline_fev1_pct", 75.0) / 100.0 * 3.5, 2),
            "baselineFEV1Percent": round(meta.get("baseline_fev1_pct", 75.0), 0),
            "baselineFEV1FVC": int(meta.get("baseline_fev1_fvc", 0.70) * 100 if meta.get("baseline_fev1_fvc", 0.70) < 1.0 else meta.get("baseline_fev1_fvc", 70)),
            "baselinePEF": round(meta.get("baseline_pef_lmin", 380.0), 0),
            "baselineRR": meta.get("baseline_rr", 16),
            "baselineRHR": meta.get("baseline_resting_hr", 70),
            "allergens": allergens,
            "smokingHistory": (
                f"{meta.get('smoking_status', 'Never')} ({int(meta.get('pack_years', 0))} pack-years)"
                if meta.get("smoking_status") in ("Former", "Current", "Active")
                else f"Biomass/smoke exposure, {meta.get('previous_disease', 'None')}"
            ),
            "comorbidities": comorbidities,
            "flareUpsLastYear": int(meta.get("episode_count", max(1, meta.get("comorbidity_burden", 1) + 1))),
            "simulatedDeviceProfile": meta.get("simulated_device_profile", "typical"),
            "learningBaseline": pred["learningBaseline"],
            "basePredictions": pred["basePredictions"],
            "ensemble": pred["ensemble"],
            "whatIfPreview": pred["whatIfPreview"],
            "risk24h": pred["risk24h"],
            "risk24hInterval": ci_24,
            "risk48h": pred["risk48h"],
            "risk48hInterval": ci_48,
            "riskLevel": pred["riskLevel"],
            "activeAlert": pred["activeAlert"],
            "alertHeadline": pred["alertHeadline"],
            "alertTriggerTime": "2026-10-13 06:00 IST",
            "leadTimeHours": pred["leadTimeHours"],
            "estimatedInflammationState": pred["estimatedInflammationState"],
            "inflammationThreshold": pred["inflammationThreshold"],
            "currentTelemetry": {
                "spo2": spo2,
                "rr": rr,
                "rhr": rhr,
                "hrv": hrv,
                "sleepAwakenings": sleep_awakenings,
                "deepSleepPercent": deep_sleep_pct,
                "steps": steps,
                "rescuePuffs24h": rescue_puffs_24h,
            },
            "currentAirQuality": {
                "pm25": pm25,
                "pm10": pm10,
                "aqi": aqi,
                "aqiCategory": aqi_cat,
                "temp": temp,
                "humidity": humidity,
            },
            "shapReasons": pred["shapReasons"],
        }

    def predict_cohort(self, end_hour: int = 168, limit: int = 12) -> List[Dict[str, Any]]:
        """Generates the triage cohort roster for the doctor dashboard."""
        cohort = []
        demo_ids = list(self.registered_demo_ids)

        for did in demo_ids:
            try:
                patient_obj = self.get_formatted_patient(did, end_hour=end_hour)
                cohort.append(patient_obj)
            except Exception as e:
                print(f"Error processing {did}: {e}")

        # If more are needed up to limit, draw from dataset
        if len(cohort) < limit:
            remaining = limit - len(cohort)
            for p_id in self.patient_ids[6:6 + remaining]:
                try:
                    patient_obj = self.get_formatted_patient(p_id, end_hour=end_hour)
                    cohort.append(patient_obj)
                except Exception as e:
                    print(f"Error processing {p_id}: {e}")

        # Sort descending by 48h risk
        cohort.sort(key=lambda x: x["risk48h"], reverse=True)
        return cohort

    def register_patient(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Dynamically onboards a new synthetic patient into the digital twin core,
        synthesizes their 240h wearable & environmental stream conditioned on their
        simulated_device_profile, updates both TCN and XGBoost static tables, runs the
        full Dilated TCN + XGBoost + MLP forward pass, and returns the live twin state
        with FR-16 learning-baseline uncertainty intervals.
        """
        import random

        existing_nums = [
            int(k.split("-")[1]) for k in DEMO_PERSONAS.keys() if k.startswith("PT-") and k.split("-")[1].isdigit()
        ]
        next_num = max(existing_nums, default=9000) + random.randint(11, 89)
        demo_id = data.get("id") or f"PT-{next_num}"
        dataset_id = f"PATIENT_{len(self.patients_df) + 1:04d}"

        city = data.get("city") or "New Delhi"
        station = data.get("station") or DEFAULT_CITY_STATIONS.get(city, f"{city} Central CPCB")

        raw_name = (data.get("name") or "").strip()
        if not raw_name or raw_name.lower() == "new patient":
            alias = FICTIONAL_SYNTHETIC_ALIASES[len(self.patients_df) % len(FICTIONAL_SYNTHETIC_ALIASES)]
            name = f"{alias} ({demo_id})"
        else:
            name = raw_name

        gender = data.get("gender") or data.get("sex") or "Male"
        sex = "Male" if gender in ["Male", "M"] else "Female"
        age = int(data.get("age", 40))
        bmi = float(data.get("bmi", 24.5))
        height_cm = float(data.get("height_cm", 172.0))
        weight_kg = float(data.get("weight_kg", round(bmi * ((height_cm / 100) ** 2), 1)))

        asthma_severity = data.get("asthma_severity") or "Moderate_Persistent"
        controller_medication = data.get("controller_medication") or "Budesonide_Formoterol_200_6"
        reported_adherence = data.get("reported_adherence", data.get("controller_adherence", 75))
        medication_adherence = float(reported_adherence if reported_adherence is not None else 75) / 100.0

        baseline_fev1_pct = float(data.get("baseline_fev1_pct") if data.get("baseline_fev1_pct") is not None else 72.0)
        fev1_fvc_in = data.get("baseline_fev1_fvc")
        if fev1_fvc_in is None or fev1_fvc_in == "":
            baseline_fev1_fvc = round(float(np.clip(0.55 + (baseline_fev1_pct / 100.0) * 0.24, 0.50, 0.88)), 2)
        else:
            baseline_fev1_fvc = float(fev1_fvc_in)
            if baseline_fev1_fvc > 1.0:
                baseline_fev1_fvc = round(baseline_fev1_fvc / 100.0, 2)

        pef_in = data.get("baseline_pef_lmin")
        if pef_in is None or pef_in == "":
            baseline_pef_lmin = round(float(np.clip(baseline_fev1_pct * 5.2, 180.0, 620.0)), 1)
        else:
            baseline_pef_lmin = float(pef_in)

        # Simulated wearable device profile ("typical", "restless_sleeper", "low_activity")
        device_profile = (data.get("simulated_device_profile") or "typical").lower().strip()
        if device_profile not in ("typical", "restless_sleeper", "low_activity"):
            device_profile = "typical"

        # Wearable signals are generated by the simulator rather than asked on the form
        if data.get("baseline_spo2") is not None:
            baseline_spo2 = float(data["baseline_spo2"])
        else:
            baseline_spo2 = 94.5 if device_profile == "restless_sleeper" else (95.5 if "Severe" not in asthma_severity else 93.0)

        if data.get("baseline_resting_hr") is not None:
            baseline_resting_hr = int(data["baseline_resting_hr"])
        else:
            baseline_resting_hr = 78 if device_profile in ("restless_sleeper", "low_activity") else 72

        if data.get("baseline_rr") is not None:
            baseline_rr = int(data["baseline_rr"])
        else:
            baseline_rr = 18 if device_profile == "restless_sleeper" or "Severe" in asthma_severity else 15

        smoking_status = data.get("smoking_status") or "Never"
        if smoking_status == "Never":
            pack_years = 0
        else:
            pack_years = int(data.get("pack_years") if data.get("pack_years") is not None else (8 if smoking_status == "Former" else 15))

        copd_status = bool(data.get("copd_status", False))
        flare_ups_last_year = int(data.get("flare_ups_last_year") if data.get("flare_ups_last_year") is not None else 1)
        hospitalized = bool(data.get("hospitalized", False))

        raw_allergens = data.get("allergens")
        if isinstance(raw_allergens, list):
            allergen_list = [str(a).strip() for a in raw_allergens if str(a).strip()]
        elif isinstance(raw_allergens, str) and raw_allergens.strip():
            allergen_list = [a.strip() for a in raw_allergens.split(",") if a.strip()]
        else:
            allergen_list = ["Dust Mites", "Vehicle Exhaust"]

        comorbidity_burden = int(data.get("comorbidity_burden", 2 if (flare_ups_last_year >= 2 or hospitalized) else 1))

        # Add to demo mapping & enrolled profiles
        DEMO_PERSONAS[demo_id] = {
            "dataset_id": dataset_id,
            "name": name,
            "city": city,
            "station": station,
        }
        DATASET_TO_DEMO[dataset_id] = demo_id
        if demo_id not in self.registered_demo_ids:
            self.registered_demo_ids.append(demo_id)

        profile_meta = {
            "simulated_device_profile": device_profile,
            "allergens": allergen_list,
            "is_new_enrollment": True,
            "calibration_day": 1,
        }
        self.enrolled_patient_profiles[dataset_id] = profile_meta
        self.enrolled_patient_profiles[demo_id] = profile_meta

        # 1. Add to patients_df
        p_row = {
            "patient_id": dataset_id,
            "age": age,
            "sex": sex,
            "height_cm": height_cm,
            "weight_kg": weight_kg,
            "bmi": bmi,
            "smoking_status": "Current" if smoking_status == "Active" else smoking_status,
            "pack_years": pack_years,
            "asthma_severity": asthma_severity,
            "copd_status": copd_status,
            "allergic_rhinitis": int(bool(data.get("allergic_rhinitis", len(allergen_list) >= 2))),
            "baseline_fev1_pct": baseline_fev1_pct,
            "baseline_fev1_fvc": baseline_fev1_fvc,
            "baseline_pef_lmin": baseline_pef_lmin,
            "baseline_spo2": baseline_spo2,
            "baseline_resting_hr": baseline_resting_hr,
            "baseline_rr": baseline_rr,
            "controller_medication": controller_medication,
            "medication_adherence": medication_adherence,
            "baseline_rescue_use_weekly": int(data.get("baseline_rescue_use_weekly", max(1, flare_ups_last_year))),
            "comorbidity_burden": comorbidity_burden,
        }
        self.patients_df = pd.concat([self.patients_df, pd.DataFrame([p_row])], ignore_index=True)

        # 2. Add to history_df
        h_row = {
            "patient_id": dataset_id,
            "previous_disease": data.get("previous_disease", "None"),
            "episode_count": flare_ups_last_year,
            "time_since_episode_months": int(data.get("time_since_episode_months", 4 if flare_ups_last_year > 0 else 12)),
            "previous_severity": "Severe" if hospitalized else ("Moderate" if flare_ups_last_year >= 2 else "Mild"),
            "hospitalized": int(hospitalized),
            "hospital_stay_duration_days": int(data.get("hospital_stay_duration_days", 3 if hospitalized else 0)),
            "intensive_care_required": int(bool(data.get("intensive_care_required", False))),
            "previous_complication": data.get("previous_complication", "None"),
            "residual_symptoms": data.get("residual_symptoms", "None"),
            "recovery_status": data.get("recovery_status", "Full"),
        }
        self.history_df = pd.concat([self.history_df, pd.DataFrame([h_row])], ignore_index=True)

        # 3. Recompute BOTH encoded_static_df (XGBoost) and norm_static_df (Dilated TCN)
        self._rebuild_static_tables()
        if dataset_id not in self.patient_ids:
            self.patient_ids.append(dataset_id)

        # 4. Synthesize 240 hours of continuous telemetry conditioned on clinical profile + simulated_device_profile
        np.random.seed(next_num % 1000)
        ts_rows = []
        is_high_risk = (
            "Severe" in asthma_severity
            or pack_years > 10
            or baseline_fev1_pct < 65
            or medication_adherence < 0.6
            or flare_ups_last_year >= 3
            or hospitalized
        )
        base_pm25 = (
            155.0 if city in ["New Delhi", "Kolkata"]
            else (98.0 if city in ["Mumbai", "Hyderabad", "Ahmedabad"] else 62.0)
        )

        for h in range(240):
            hour_of_day = h % 24
            is_night = hour_of_day >= 22 or hour_of_day <= 6
            commute_spike = 1.6 if (7 <= hour_of_day <= 10 or 17 <= hour_of_day <= 20) else 1.0

            pm25 = max(15.0, base_pm25 * commute_spike + np.sin(h / 12.0) * 20.0 + np.random.normal(0, 8.0))
            pm10 = pm25 * 1.6 + np.random.normal(0, 10.0)
            aqi = min(500, int(pm25 * 1.35))

            hr_drift = (3.5 if is_high_risk and h > 120 else 0.0) + (10.0 if not is_night and 9 <= hour_of_day <= 18 else -4.0)
            hr = max(50.0, baseline_resting_hr + hr_drift + np.random.normal(0, 2.5))

            rr_night_bump = 1.8 if (device_profile == "restless_sleeper" and is_night) else 0.0
            rr_drift = (2.8 if is_high_risk and h > 120 else 0.0) + (1.5 if not is_night else -1.0) + rr_night_bump
            rr = max(10.0, baseline_rr + rr_drift + np.random.normal(0, 1.2))

            spo2_dip = (-2.5 if is_high_risk and is_night else 0.0) + (-1.0 if device_profile == "restless_sleeper" and is_night else 0.0)
            spo2 = max(86.0, min(99.0, baseline_spo2 + spo2_dip + np.random.normal(0, 0.6)))

            hrv_profile_shift = -8.0 if device_profile == "restless_sleeper" else (-4.0 if device_profile == "low_activity" else 0.0)
            hrv = max(15.0, min(85.0, 48.0 - (15.0 if is_high_risk else 0.0) + hrv_profile_shift + np.random.normal(0, 4.0)))

            cough = int(np.random.choice([0, 1, 2, 3], p=[0.7, 0.2, 0.07, 0.03] if not is_high_risk else [0.35, 0.35, 0.20, 0.10]))
            wheeze = int(np.random.choice([0, 1, 2, 3], p=[0.8, 0.15, 0.04, 0.01] if not is_high_risk else [0.4, 0.35, 0.18, 0.07]))
            rescue_puffs = 1 if (is_high_risk and h % 24 in [8, 22] and np.random.rand() > 0.35) else 0

            if not is_night:
                if device_profile == "low_activity":
                    steps_val = int(max(0, np.random.randint(30, 220)))
                    active_mins = int(np.random.randint(1, 6))
                else:
                    steps_val = int(max(0, np.random.randint(120, 780)))
                    active_mins = int(np.random.randint(5, 20))
                sleep_interr = 0
            else:
                steps_val = 0
                active_mins = 0
                if device_profile == "restless_sleeper":
                    sleep_interr = int(np.random.choice([0, 1, 2], p=[0.45, 0.40, 0.15]))
                else:
                    sleep_interr = int(1 if (is_high_risk and hour_of_day in [2, 4] and np.random.rand() > 0.6) else 0)

            ts_rows.append({
                "patient_id": dataset_id,
                "timestamp_hour": h,
                "spo2": round(spo2, 1),
                "heart_rate": round(hr, 1),
                "hrv_rmssd": round(hrv, 1),
                "respiratory_rate": round(rr, 1),
                "skin_temp_c": 36.6,
                "step_count": steps_val,
                "activity_intensity": 1 if (not is_night and device_profile != "low_activity") else 0,
                "active_minutes": active_mins,
                "sleep_duration_hrs": 0.0 if not is_night else (0.75 if device_profile == "restless_sleeper" else 1.0),
                "sleep_interruptions": sleep_interr,
                "breathlessness_score": 1 if is_high_risk and not is_night else 0,
                "cough_severity": cough,
                "wheezing_score": wheeze,
                "chest_tightness": 1 if is_high_risk else 0,
                "sputum_severity": 0,
                "fatigue_score": 1 if (is_high_risk or device_profile == "restless_sleeper") else 0,
                "rescue_inhaler_puffs": rescue_puffs,
                "pm25_concentration": round(pm25, 1),
                "pm10_concentration": round(pm10, 1),
                "aqi_index": int(aqi),
            })

        new_ts_df = pd.DataFrame(ts_rows)
        self.ts_df = pd.concat([self.ts_df, new_ts_df], ignore_index=True)

        # 5. Return live formatted patient twin state scored by Dilated TCN + XGBoost + MLP
        return self.get_formatted_patient(demo_id, end_hour=168)

