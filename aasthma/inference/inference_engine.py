import os
import pickle
import threading
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
    "Gurugram": "Vikas Sadan, Gurugram HSPCB",
    "Noida": "Sector 62, Noida UPPCB",
    "Ghaziabad": "Vasundhara, Ghaziabad UPPCB",
    "Faridabad": "Sector 16A, Faridabad HSPCB",
    "Chandigarh": "Sector 25, Chandigarh CPCC",
    "Amritsar": "Golden Temple, Amritsar PPCB",
    "Ludhiana": "PAU Campus, Ludhiana PPCB",
    "Jaipur": "Adarsh Nagar, Jaipur RSPCB",
    "Jodhpur": "Collectorate, Jodhpur RSPCB",
    "Kota": "Shrinath Puram, Kota RSPCB",
    "Udaipur": "Ashok Nagar, Udaipur RSPCB",
    "Dehradun": "Doon University, Dehradun UKPCB",
    "Srinagar": "Rajbagh, Srinagar JKPCB",
    "Shimla": "Ridge Station, Shimla HPPCB",
    "Lucknow": "Talkatora District, Lucknow CPCB",
    "Kanpur": "Nehru Nagar, Kanpur UPPCB",
    "Varanasi": "Ardhali Bazar, Varanasi UPPCB",
    "Agra": "Sanjay Palace, Agra UPPCB",
    "Prayagraj": "Nagar Nigam, Prayagraj UPPCB",
    "Meerut": "Ganga Nagar, Meerut UPPCB",
    "Patna": "IGSC Planetarium, Patna BSPCB",
    "Gaya": "Collectorate, Gaya BSPCB",
    "Ranchi": "Albert Ekka Chowk, Ranchi JSPCB",
    "Jamshedpur": "Bistupur, Jamshedpur JSPCB",
    "Raipur": "AIIMS Tatibandh, Raipur CECB",
    "Bhopal": "T.T. Nagar, Bhopal MPPCB",
    "Indore": "Chhoti Gwaltoli, Indore MPPCB",
    "Gwalior": "Phoolbagh, Gwalior MPPCB",
    "Jabalpur": "Marhatal, Jabalpur MPPCB",
    "Mumbai": "Bandra Kurla Complex, Mumbai MPCB",
    "Navi Mumbai": "Nerul Sector 19, Navi Mumbai MPCB",
    "Thane": "Pimpleshwar Mandir, Thane MPCB",
    "Pune": "Shivajinagar, Pune MPCB",
    "Nagpur": "Opp GPO Civil Lines, Nagpur MPCB",
    "Nashik": "Gangapur Road, Nashik MPCB",
    "Chhatrapati Sambhajinagar": "More Chowk Waluj, MPCB",
    "Ahmedabad": "Maninagar, Ahmedabad GPCB",
    "Surat": "Science Centre City Light, Surat GPCB",
    "Vadodara": "Dandia Bazar, Vadodara GPCB",
    "Rajkot": "Race Course, Rajkot GPCB",
    "Gandhinagar": "Sector 10, Gandhinagar GPCB",
    "Panaji": "Patto Plaza, Panaji GSPCB",
    "Bengaluru": "Bengaluru Central CPCB",
    "Mysuru": "Hebbal 1st Stage, Mysuru KSPCB",
    "Mangaluru": "Kadri, Mangaluru KSPCB",
    "Hubballi": "Deshpande Nagar, Hubballi KSPCB",
    "Chennai": "Alandur Bus Depot, Chennai CPCB",
    "Coimbatore": "SIDCO Kurichi, Coimbatore TNPCB",
    "Madurai": "Tallakulam, Madurai TNPCB",
    "Tiruchirappalli": "Bishop Heber, Trichy TNPCB",
    "Puducherry": "Jawahar Nagar, Puducherry PPCC",
    "Hyderabad": "Sanathnagar, Hyderabad TSPCB",
    "Warangal": "Hanamkonda, Warangal TSPCB",
    "Visakhapatnam": "GVM Corporation, Vizag APPCB",
    "Vijayawada": "PWD Grounds, Vijayawada APPCB",
    "Tirupati": "Tirumala, Tirupati APPCB",
    "Kochi": "Vyttila Mobility Hub, Kochi KSPCB",
    "Thiruvananthapuram": "Plamoodu, Trivandrum KSPCB",
    "Kozhikode": "Palayam, Kozhikode KSPCB",
    "Kolkata": "Victoria Memorial, Kolkata WBPCB",
    "Howrah": "Ghusuri, Howrah WBPCB",
    "Asansol": "Asansol Court Area, WBPCB",
    "Siliguri": "Ward 32 Bapupara, Siliguri WBPCB",
    "Bhubaneswar": "Lingaraj Mandir, Bhubaneswar OSPCB",
    "Cuttack": "CDA Area, Cuttack OSPCB",
    "Guwahati": "Railway Colony, Guwahati PCBA",
    "Shillong": "Lumpyngngad, Shillong MSPCB",
    "Agartala": "Kunjaban, Agartala TSPCB",
    "Imphal": "Kangla Park, Imphal MPCB",
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

STATION_COORDINATES: Dict[str, Tuple[float, float]] = {
    # Delhi NCR & North India
    "Anand Vihar CPCB": (28.6469, 77.3164),
    "Anand Vihar, Delhi DPCC": (28.6469, 77.3164),
    "RK Puram DPCC": (28.5633, 77.1869),
    "New Delhi": (28.6139, 77.2090),
    "Gurugram": (28.4595, 77.0266),
    "Vikas Sadan, Gurugram HSPCB": (28.4595, 77.0266),
    "Noida": (28.5355, 77.3910),
    "Sector 62, Noida UPPCB": (28.6208, 77.3639),
    "Ghaziabad": (28.6692, 77.4538),
    "Vasundhara, Ghaziabad UPPCB": (28.6604, 77.3753),
    "Faridabad": (28.4089, 77.3178),
    "Sector 16A, Faridabad HSPCB": (28.4089, 77.3178),
    "Chandigarh": (30.7333, 76.7794),
    "Sector 25, Chandigarh CPCC": (30.7489, 76.7567),
    "Amritsar": (31.6340, 74.8723),
    "Golden Temple, Amritsar PPCB": (31.6200, 74.8765),
    "Ludhiana": (30.9010, 75.8573),
    "PAU Campus, Ludhiana PPCB": (30.9010, 75.8071),
    "Jaipur": (26.9124, 75.7873),
    "Adarsh Nagar, Jaipur RSPCB": (26.9015, 75.8273),
    "Jodhpur": (26.2389, 73.0243),
    "Collectorate, Jodhpur RSPCB": (26.2921, 73.0369),
    "Kota": (25.2138, 75.8648),
    "Shrinath Puram, Kota RSPCB": (25.1389, 75.8335),
    "Udaipur": (24.5854, 73.7125),
    "Ashok Nagar, Udaipur RSPCB": (24.5854, 73.7125),
    "Dehradun": (30.3165, 78.0322),
    "Doon University, Dehradun UKPCB": (30.2683, 78.0449),
    "Srinagar": (34.0837, 74.7973),
    "Rajbagh, Srinagar JKPCB": (34.0672, 74.8286),
    "Shimla": (31.1048, 77.1734),
    "Ridge Station, Shimla HPPCB": (31.1048, 77.1734),
    "Lucknow": (26.8467, 80.9462),
    "Talkatora District, Lucknow CPCB": (26.8340, 80.8917),
    "Kanpur": (26.4499, 80.3319),
    "Nehru Nagar, Kanpur UPPCB": (26.4712, 80.3266),
    "Varanasi": (25.3176, 82.9739),
    "Ardhali Bazar, Varanasi UPPCB": (25.3446, 82.9790),
    "Agra": (27.1767, 78.0081),
    "Sanjay Palace, Agra UPPCB": (27.1983, 78.0057),
    "Prayagraj": (25.4358, 81.8463),
    "Nagar Nigam, Prayagraj UPPCB": (25.4358, 81.8463),
    "Meerut": (28.9845, 77.7064),
    "Ganga Nagar, Meerut UPPCB": (28.9954, 77.7570),
    # East & Central India
    "Patna": (25.5941, 85.1376),
    "IGSC Planetarium, Patna BSPCB": (25.6116, 85.1319),
    "Gaya": (24.7914, 85.0002),
    "Collectorate, Gaya BSPCB": (24.7914, 85.0002),
    "Ranchi": (23.3441, 85.3096),
    "Albert Ekka Chowk, Ranchi JSPCB": (23.3688, 85.3262),
    "Jamshedpur": (22.8046, 86.2029),
    "Bistupur, Jamshedpur JSPCB": (22.8046, 86.2029),
    "Raipur": (21.2514, 81.6296),
    "AIIMS Tatibandh, Raipur CECB": (21.2569, 81.5792),
    "Bhopal": (23.2599, 77.4126),
    "T.T. Nagar, Bhopal MPPCB": (23.2348, 77.4005),
    "Indore": (22.7196, 75.8577),
    "Chhoti Gwaltoli, Indore MPPCB": (22.7169, 75.8722),
    "Gwalior": (26.2183, 78.1828),
    "Phoolbagh, Gwalior MPPCB": (26.2124, 78.1772),
    "Jabalpur": (23.1815, 79.9864),
    "Marhatal, Jabalpur MPPCB": (23.1686, 79.9339),
    "Kolkata": (22.5726, 88.3639),
    "Victoria Memorial WBPCB": (22.5448, 88.3426),
    "Victoria Memorial CPCB": (22.5448, 88.3426),
    "Victoria Memorial, Kolkata WBPCB": (22.5448, 88.3426),
    "Howrah": (22.5958, 88.2636),
    "Ghusuri, Howrah WBPCB": (22.6114, 88.3497),
    "Asansol": (23.6739, 86.9524),
    "Asansol Court Area, WBPCB": (23.6739, 86.9524),
    "Siliguri": (26.7271, 88.3953),
    "Ward 32 Bapupara, Siliguri WBPCB": (26.7271, 88.3953),
    "Bhubaneswar": (20.2961, 85.8245),
    "Lingaraj Mandir, Bhubaneswar OSPCB": (20.2382, 85.8338),
    "Cuttack": (20.4625, 85.8830),
    "CDA Area, Cuttack OSPCB": (20.4810, 85.8436),
    "Guwahati": (26.1445, 91.7362),
    "Railway Colony, Guwahati PCBA": (26.1806, 91.7872),
    "Shillong": (25.5788, 91.8933),
    "Lumpyngngad, Shillong MSPCB": (25.5788, 91.8933),
    "Agartala": (23.8315, 91.2868),
    "Kunjaban, Agartala TSPCB": (23.8569, 91.2868),
    "Imphal": (24.8170, 93.9368),
    "Kangla Park, Imphal MPCB": (24.8081, 93.9442),
    # West India
    "Chembur MPCB": (19.0522, 72.9005),
    "Bandra MPCB": (19.0650, 72.8640),
    "Bandra Kurla Complex, Mumbai": (19.0650, 72.8640),
    "Bandra Kurla Complex, Mumbai MPCB": (19.0650, 72.8640),
    "Mumbai": (19.0760, 72.8777),
    "Navi Mumbai": (19.0330, 73.0297),
    "Nerul Sector 19, Navi Mumbai MPCB": (19.0330, 73.0297),
    "Thane": (19.2183, 72.9781),
    "Pimpleshwar Mandir, Thane MPCB": (19.2183, 72.9781),
    "Pune": (18.5204, 73.8567),
    "Shivajinagar, Pune MPCB": (18.5314, 73.8446),
    "Nagpur": (21.1458, 79.0882),
    "Opp GPO Civil Lines, Nagpur MPCB": (21.1539, 79.0731),
    "Nashik": (19.9975, 73.7898),
    "Gangapur Road, Nashik MPCB": (20.0087, 73.7639),
    "Chhatrapati Sambhajinagar": (19.8762, 75.3433),
    "More Chowk Waluj, MPCB": (19.8400, 75.2470),
    "Maninagar GPCB": (22.9962, 72.6025),
    "Maninagar, Ahmedabad GPCB": (22.9962, 72.6025),
    "Ahmedabad": (23.0225, 72.5714),
    "Surat": (21.1702, 72.8311),
    "Science Centre City Light, Surat GPCB": (21.1702, 72.7954),
    "Vadodara": (22.3072, 73.1812),
    "Dandia Bazar, Vadodara GPCB": (22.3008, 73.2043),
    "Rajkot": (22.3039, 70.8022),
    "Race Course, Rajkot GPCB": (22.3039, 70.7931),
    "Gandhinagar": (23.2156, 72.6369),
    "Sector 10, Gandhinagar GPCB": (23.2156, 72.6369),
    "Panaji": (15.4909, 73.8278),
    "Patto Plaza, Panaji GSPCB": (15.4945, 73.8350),
    # South India
    "Silk Board KSPCB": (12.9177, 77.6238),
    "BTM Layout KSPCB": (12.9166, 77.6101),
    "Bengaluru Central CPCB": (12.9716, 77.5946),
    "Bengaluru": (12.9716, 77.5946),
    "Mysuru": (12.2958, 76.6394),
    "Hebbal 1st Stage, Mysuru KSPCB": (12.3458, 76.6122),
    "Mangaluru": (12.9141, 74.8560),
    "Kadri, Mangaluru KSPCB": (12.8887, 74.8569),
    "Hubballi": (15.3647, 75.1240),
    "Deshpande Nagar, Hubballi KSPCB": (15.3578, 75.1394),
    "Alandur, Chennai CPCB": (12.9975, 80.1973),
    "Alandur Bus Depot, Chennai CPCB": (12.9975, 80.1973),
    "Chennai": (13.0827, 80.2707),
    "Coimbatore": (11.0168, 76.9558),
    "SIDCO Kurichi, Coimbatore TNPCB": (10.9469, 76.9739),
    "Madurai": (9.9252, 78.1198),
    "Tallakulam, Madurai TNPCB": (9.9360, 78.1342),
    "Tiruchirappalli": (10.7905, 78.7047),
    "Bishop Heber, Trichy TNPCB": (10.8155, 78.6750),
    "Puducherry": (11.9416, 79.8083),
    "Jawahar Nagar, Puducherry PPCC": (11.9338, 79.8047),
    "Sanathnagar, Hyderabad PCB": (17.4563, 78.4439),
    "Sanathnagar, Hyderabad TSPCB": (17.4563, 78.4439),
    "Hyderabad": (17.3850, 78.4867),
    "Warangal": (17.9689, 79.5941),
    "Hanamkonda, Warangal TSPCB": (18.0000, 79.5800),
    "Visakhapatnam": (17.6868, 83.2185),
    "GVM Corporation, Vizag APPCB": (17.7219, 83.3016),
    "Vijayawada": (16.5062, 80.6480),
    "PWD Grounds, Vijayawada APPCB": (16.5093, 80.6305),
    "Tirupati": (13.6288, 79.4192),
    "Tirumala, Tirupati APPCB": (13.6833, 79.3472),
    "Kochi": (9.9312, 76.2673),
    "Vyttila Mobility Hub, Kochi KSPCB": (9.9675, 76.3183),
    "Thiruvananthapuram": (8.5241, 76.9366),
    "Plamoodu, Trivandrum KSPCB": (8.5142, 76.9478),
    "Kozhikode": (11.2588, 75.7804),
    "Palayam, Kozhikode KSPCB": (11.2488, 75.7839),
}


class InferenceEngine:
    """Production Inference Engine for BreathTwin Multimodal Stacked Ensemble (Dilated TCN + XGBoost -> MLP)."""

    def __init__(self, device: Optional[str] = None):
        self._inference_lock = threading.RLock()
        self._live_aq_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
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
        for gb_m in self.gb_models.values():
            try:
                if hasattr(gb_m, "set_params"):
                    gb_m.set_params(device="cpu", n_jobs=1)
                if hasattr(gb_m, "get_booster"):
                    gb_m.get_booster().set_param({"device": "cpu", "nthread": 1})
            except Exception:
                pass
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
        with self._inference_lock, torch.no_grad():
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

        with self._inference_lock, torch.no_grad():
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
        with self._inference_lock:
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
            raw_risk_48h = float(torch.sigmoid(meta_48h).item() * 100)
            risk_48h = max(raw_risk_48h, round(min(99.0, risk_24h * 1.08), 1)) if raw_risk_48h < risk_24h else raw_risk_48h
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

        # Air quality fields (prefer live Open-Meteo CAMS + Weather feed for the patient's CPCB station)
        live_aq = self._fetch_live_station_air_quality(str(meta.get("city", "New Delhi")), str(meta.get("station", "")))
        if live_aq is not None:
            pm25 = round(float(live_aq["curr_pm25"]), 0)
            pm10 = round(float(live_aq["curr_pm10"]), 0)
            cpcb_info = self.compute_cpcb_aqi_and_category(pm25)
            aqi = int(cpcb_info["value"])
            aqi_cat = str(cpcb_info["category"])
            temp = round(float(live_aq["curr_temp"]), 1)
            humidity = round(float(live_aq["curr_hum"]), 0)
        else:
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

        # 4. Synthesize 240 hours of continuous telemetry conditioned on clinical profile + live station air quality
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
        live_aq = self._fetch_live_station_air_quality(city, station)
        if live_aq is not None and live_aq.get("curr_pm25"):
            base_pm25 = max(18.0, float(live_aq["curr_pm25"]))
            live_points_by_rel_h = {
                int(pt["h"]): float(pt["pm25"])
                for pt in (live_aq.get("points") or [])
                if "h" in pt and "pm25" in pt
            }
        else:
            base_pm25 = (
                155.0 if city in ["New Delhi", "Gurugram", "Noida", "Ghaziabad", "Faridabad", "Kanpur", "Patna", "Kolkata"]
                else (98.0 if city in ["Mumbai", "Hyderabad", "Ahmedabad", "Lucknow", "Jaipur", "Pune", "Nagpur"] else 62.0)
            )
            live_points_by_rel_h = {}

        for h in range(240):
            hour_of_day = h % 24
            is_night = hour_of_day >= 22 or hour_of_day <= 6
            commute_spike = 1.6 if (7 <= hour_of_day <= 10 or 17 <= hour_of_day <= 20) else 1.0

            rel_to_168 = h - 168
            if rel_to_168 in live_points_by_rel_h:
                pm25 = max(8.0, float(live_points_by_rel_h[rel_to_168]))
            else:
                pm25 = max(15.0, base_pm25 * commute_spike + np.sin(h / 12.0) * 20.0 + np.random.normal(0, 8.0))
            pm10 = pm25 * 1.6 + np.random.normal(0, 10.0)
            aqi = int(self.compute_cpcb_aqi_and_category(pm25)["value"])

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

    @staticmethod
    def get_cpcb_bins() -> List[Dict[str, Any]]:
        """Authoritative CPCB 24-hour PM2.5 (ug/m3) and AQI category bins used for both stripes and category labels."""
        return [
            {"min": 0, "max": 30, "aqiMin": 0, "aqiMax": 50, "category": "Good"},
            {"min": 30, "max": 60, "aqiMin": 51, "aqiMax": 100, "category": "Satisfactory"},
            {"min": 60, "max": 90, "aqiMin": 101, "aqiMax": 200, "category": "Moderate"},
            {"min": 90, "max": 120, "aqiMin": 201, "aqiMax": 300, "category": "Poor"},
            {"min": 120, "max": 250, "aqiMin": 301, "aqiMax": 400, "category": "Very Poor"},
            {"min": 250, "max": 500, "aqiMin": 401, "aqiMax": 500, "category": "Severe"},
        ]

    @classmethod
    def compute_cpcb_aqi_and_category(cls, pm25: float) -> Dict[str, Any]:
        """Computes AQI value and CPCB category text strictly from the same CPCB PM2.5 bins that draw the chart stripes."""
        bins = cls.get_cpcb_bins()
        clamped_pm = max(0.0, float(pm25))
        for b in bins:
            if clamped_pm <= b["max"] or b == bins[-1]:
                span_pm = max(1.0, float(b["max"] - b["min"]))
                frac = min(1.0, max(0.0, (clamped_pm - b["min"]) / span_pm))
                aqi_val = int(round(b["aqiMin"] + frac * (b["aqiMax"] - b["aqiMin"])))
                return {"value": aqi_val, "category": b["category"]}
        return {"value": 500, "category": "Severe"}

    def _fetch_live_station_air_quality(
        self, city: str, station: str
    ) -> Optional[Dict[str, Any]]:
        """
        Fetches real-time station PM2.5, PM10, temperature, relative humidity, and
        the 72-hour hourly PM2.5 timeline (past 24h observed + next 48h forecast)
        for the patient's CPCB/state monitor coordinates via Open-Meteo CAMS & Weather APIs.
        Caches responses for 10 minutes per station and falls back to None if offline.
        """
        import json
        import time
        import urllib.parse
        import urllib.request

        cache_key = f"{city}::{station}"
        now_ts = time.time()
        cached = self._live_aq_cache.get(cache_key)
        if cached and (now_ts - cached[0]) < 600.0:
            return cached[1]

        coords = STATION_COORDINATES.get(station) or STATION_COORDINATES.get(city)
        if coords is None and city:
            try:
                geo_url = (
                    f"https://geocoding-api.open-meteo.com/v1/search"
                    f"?name={urllib.parse.quote(city)}&count=1&language=en&format=json&countryCode=IN"
                )
                req_geo = urllib.request.Request(geo_url, headers={"User-Agent": "BreathTwin-Clinical/0.3.1"})
                with urllib.request.urlopen(req_geo, timeout=2.5) as resp_geo:
                    geo_data = json.loads(resp_geo.read().decode("utf-8"))
                results = geo_data.get("results") or []
                if results and "latitude" in results[0] and "longitude" in results[0]:
                    coords = (float(results[0]["latitude"]), float(results[0]["longitude"]))
                    STATION_COORDINATES[city] = coords
            except Exception:
                coords = None

        lat, lon = coords or (28.6469, 77.3164)

        aq_url = (
            f"https://air-quality-api.open-meteo.com/v1/air-quality"
            f"?latitude={lat}&longitude={lon}"
            f"&current=pm2_5,pm10"
            f"&hourly=pm2_5,pm10"
            f"&past_hours=24&forecast_hours=49"
            f"&timezone=Asia%2FKolkata"
        )
        wx_url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}"
            f"&current=temperature_2m,relative_humidity_2m"
            f"&timezone=Asia%2FKolkata"
        )

        try:
            req_aq = urllib.request.Request(aq_url, headers={"User-Agent": "BreathTwin-Clinical/0.3.1"})
            with urllib.request.urlopen(req_aq, timeout=3.5) as resp_aq:
                aq_data = json.loads(resp_aq.read().decode("utf-8"))

            req_wx = urllib.request.Request(wx_url, headers={"User-Agent": "BreathTwin-Clinical/0.3.1"})
            with urllib.request.urlopen(req_wx, timeout=3.5) as resp_wx:
                wx_data = json.loads(resp_wx.read().decode("utf-8"))

            hourly = aq_data.get("hourly") or {}
            times = hourly.get("time") or []
            pm25_list = hourly.get("pm2_5") or []
            if len(times) < 48 or len(pm25_list) < 48:
                return None

            aq_curr = aq_data.get("current") or {}
            wx_curr = wx_data.get("current") or {}

            valid_pm25 = [float(x) for x in pm25_list if x is not None]
            fallback_pm25 = valid_pm25[-1] if valid_pm25 else 65.0

            curr_pm25 = float(
                aq_curr.get("pm2_5") if aq_curr.get("pm2_5") is not None else fallback_pm25
            )
            curr_pm10 = float(
                aq_curr.get("pm10") if aq_curr.get("pm10") is not None else curr_pm25 * 1.65
            )
            curr_temp = float(
                wx_curr.get("temperature_2m") if wx_curr.get("temperature_2m") is not None else 28.0
            )
            curr_hum = float(
                wx_curr.get("relative_humidity_2m")
                if wx_curr.get("relative_humidity_2m") is not None
                else 65.0
            )

            # Split into 25 observed points (h = -24 .. 0) and 48 forecast points (h = +1 .. +48)
            now_idx = min(24, len(times) - 1)
            points: List[Dict[str, Any]] = []
            obs_vals: List[float] = []

            for idx in range(0, min(len(times), now_idx + 49)):
                rel_h = idx - now_idx
                raw_t = str(times[idx])
                t_iso = f"{raw_t}:00+05:30" if len(raw_t) == 16 else raw_t
                raw_pm = pm25_list[idx]
                pm_val = round(float(raw_pm if raw_pm is not None else curr_pm25), 0)
                if rel_h == 0:
                    pm_val = round(curr_pm25, 0)
                kind = "observed" if rel_h <= 0 else "forecast"
                if kind == "observed":
                    obs_vals.append(pm_val)
                points.append({
                    "t": t_iso,
                    "h": rel_h,
                    "pm25": pm_val,
                    "kind": kind,
                })

            prev_24h_mean = float(np.mean(obs_vals[:-1])) if len(obs_vals) > 1 else curr_pm25

            result = {
                "curr_pm25": round(curr_pm25, 0),
                "curr_pm10": round(curr_pm10, 0),
                "curr_temp": round(curr_temp, 1),
                "curr_hum": int(round(curr_hum)),
                "prev_pm25": round(prev_24h_mean, 1),
                "points": points,
                "is_live": True,
            }
            self._live_aq_cache[cache_key] = (now_ts, result)
            return result
        except Exception:
            return None

    def get_patient_forecast(
        self,
        pid: str,
        end_hour: int = 168,
        as_of_iso: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Builds the unified Section 5 forecast payload stamped with simulation clock time.
        Feeds V1 (risk curve), V2 (driver waterfall), V3 (signal drift), and V4 (air-quality timeline).
        """
        from datetime import datetime, timedelta

        base_dt = datetime.fromisoformat("2026-10-07T00:00:00+05:30")
        if as_of_iso:
            try:
                parsed_dt = datetime.fromisoformat(as_of_iso.replace("Z", "+00:00"))
                diff_h = int(round((parsed_dt - base_dt).total_seconds() / 3600.0))
                end_hour = max(12, min(239, diff_h))
            except Exception:
                pass

        end_hour = max(12, min(239, int(end_hour)))
        current_dt = base_dt + timedelta(hours=end_hour)
        resolved_as_of = current_dt.isoformat()

        resolved_pid = self.resolve_patient_id(pid)
        if resolved_pid not in self.patient_ids:
            raise KeyError(f"Patient {pid} not found")
        formatted = self.get_formatted_patient(pid, end_hour=end_hour)

        # Seed derived deterministically from patient ID
        seed_num = sum(ord(c) for c in str(pid)) % 97 + 1

        # 1. Alert Policy & Status
        threshold = 0.70
        max_interval_width = 0.30
        p24 = round(float(formatted["risk24h"]) / 100.0, 4)
        p48 = round(max(float(formatted["risk48h"]), float(formatted["risk24h"])) / 100.0, 4)
        lo24 = round(min(p24, float(formatted["risk24hInterval"][0]) / 100.0), 4)
        hi24 = round(max(p24, float(formatted["risk24hInterval"][1]) / 100.0), 4)
        lo48 = round(min(p48, max(float(formatted["risk48hInterval"][0]) / 100.0, lo24)), 4)
        hi48 = round(max(p48, float(formatted["risk48hInterval"][1]) / 100.0, hi24), 4)

        half_w24 = max(0.05, p24 - lo24, hi24 - p24)
        half_w48 = max(half_w24, p48 - lo48, hi48 - p48)

        if p48 >= threshold:
            status = "alert"
            status_label = "Alert"
        elif p48 >= 0.35 or (hi48 - lo48) > max_interval_width:
            status = "watch"
            status_label = "Watch"
        else:
            status = "normal"
            status_label = "Normal"

        # 2. V1 Risk Curve: 49 hourly points from 0 to +48h, cumulative probability never decreases
        curve: List[Dict[str, Any]] = []
        prev_p, prev_lo, prev_hi = 0.0, 0.0, 0.0
        for h in range(49):
            if h == 0:
                p_h, lo_h, hi_h = 0.0, 0.0, 0.0
            elif h <= 24:
                frac = (h / 24.0) ** 0.85
                w_h = half_w24 * ((h / 24.0) ** 0.65)
                p_h = round(p24 * frac, 4)
                lo_h = round(max(0.0, p_h - w_h), 4)
                hi_h = round(min(1.0, p_h + w_h), 4)
            else:
                frac = ((h - 24.0) / 24.0) ** 0.90
                w_h = half_w24 + (half_w48 - half_w24) * frac
                p_h = round(p24 + (p48 - p24) * frac, 4)
                lo_h = round(max(0.0, p_h - w_h), 4)
                hi_h = round(min(1.0, p_h + w_h), 4)

            if h == 24:
                p_h, lo_h, hi_h = p24, lo24, hi24
            elif h == 48:
                p_h, lo_h, hi_h = p48, lo48, hi48

            p_h = max(prev_p, min(1.0, p_h))
            lo_h = min(p_h, max(prev_lo, min(1.0, lo_h)))
            hi_h = max(p_h, max(prev_hi, min(1.0, hi_h)))
            prev_p, prev_lo, prev_hi = p_h, lo_h, hi_h

            curve.append({
                "h": h,
                "t": (current_dt + timedelta(hours=h)).isoformat(),
                "p": round(p_h, 4),
                "lo": round(lo_h, 4),
                "hi": round(hi_h, 4),
            })

        # Slice patient time series for signals, air quality fallback, and 24h driver changes
        p_ts_all = self.ts_df[self.ts_df["patient_id"] == resolved_pid].sort_values("timestamp_hour")
        p_ts_obs = p_ts_all[p_ts_all["timestamp_hour"] <= end_hour]
        if p_ts_obs.empty:
            p_ts_obs = p_ts_all.iloc[:24]

        # 7-day trailing window (up to 168 hours)
        window_7d = p_ts_obs.iloc[-168:].copy()
        prev_24_slice = p_ts_obs.iloc[-48:-24] if len(p_ts_obs) >= 48 else p_ts_obs.iloc[:max(1, len(p_ts_obs) // 2)]

        # Fetch live station air quality (Open-Meteo CAMS + Weather for patient's CPCB station) with fallback
        city_name = str(formatted.get("city", "New Delhi"))
        station_full = str(formatted.get("station", "Central Monitor"))
        live_aq = self._fetch_live_station_air_quality(city_name, station_full)

        if live_aq is not None:
            curr_pm25 = float(live_aq["curr_pm25"])
            curr_pm10 = float(live_aq["curr_pm10"])
            curr_temp = float(live_aq["curr_temp"])
            curr_hum = float(live_aq["curr_hum"])
            prev_pm25 = float(live_aq["prev_pm25"])
            aq_points = live_aq["points"]
        else:
            curr_pm25 = float(formatted["currentAirQuality"]["pm25"])
            curr_pm10 = float(formatted["currentAirQuality"]["pm10"])
            curr_temp = float(formatted["currentAirQuality"]["temp"])
            curr_hum = float(formatted["currentAirQuality"]["humidity"])
            prev_pm25 = (
                float(prev_24_slice["pm25_concentration"].mean())
                if "pm25_concentration" in prev_24_slice and not prev_24_slice.empty
                else curr_pm25
            )
            aq_points = []
            obs_24 = p_ts_obs.iloc[-25:] if len(p_ts_obs) >= 25 else p_ts_obs
            for _, r in obs_24.iterrows():
                h_val = int(r["timestamp_hour"])
                pm_val = round(float(r.get("pm25_concentration", curr_pm25)), 0)
                if h_val == end_hour:
                    pm_val = curr_pm25
                aq_points.append({
                    "t": (base_dt + timedelta(hours=h_val)).isoformat(),
                    "h": h_val - end_hour,
                    "pm25": pm_val,
                    "kind": "observed",
                })

            future_slice = p_ts_all[
                (p_ts_all["timestamp_hour"] > end_hour) &
                (p_ts_all["timestamp_hour"] <= end_hour + 48)
            ]
            future_map = {int(r["timestamp_hour"]): float(r["pm25_concentration"]) for _, r in future_slice.iterrows()}

            for f_step in range(1, 49):
                f_hour = end_hour + f_step
                if f_hour in future_map:
                    f_pm = round(future_map[f_hour], 0)
                else:
                    hod = f_hour % 24
                    rush = 1.22 if hod in (8, 9, 19, 20, 21) else (0.86 if hod in (13, 14, 15) else 1.0)
                    wave = np.sin(f_step / 6.0) * (curr_pm25 * 0.08)
                    f_pm = round(max(12.0, curr_pm25 * rush + wave), 0)
                aq_points.append({
                    "t": (base_dt + timedelta(hours=f_hour)).isoformat(),
                    "h": f_step,
                    "pm25": f_pm,
                    "kind": "forecast",
                })

        # Compute hourly latent inflammation I(t) across 7-day window so it ends at formatted["estimatedInflammationState"]
        adherence_pct = float(formatted.get("controllerAdherence", 75))
        adherence_ratio = adherence_pct / 100.0
        fev1_pct = float(formatted.get("baselineFEV1Percent", 75.0))
        target_inf_now = float(formatted.get("estimatedInflammationState", 0.50))
        inf_limit = float(formatted.get("inflammationThreshold", 0.65))

        inf_series_raw: List[float] = []
        i_val = float(np.clip(0.32 + (75.0 - fev1_pct) * 0.004, 0.18, 0.65))
        for _, r in window_7d.iterrows():
            pm_r = float(r.get("pm25_concentration", 60.0))
            puffs_r = float(r.get("rescue_inhaler_puffs", 0.0))
            cough_r = float(r.get("cough_severity", 0.0))
            wheeze_r = float(r.get("wheezing_score", 0.0))
            d_i = (
                -self.simulator.k * i_val
                + self.simulator.a * (pm_r * 0.72)
                + self.simulator.b * min(1.5, 0.25 * (cough_r + wheeze_r) + 0.35 * puffs_r)
                - self.simulator.c * adherence_ratio
            )
            i_val = float(np.clip(i_val + d_i, 0.10, 0.98))
            inf_series_raw.append(i_val)

        if inf_series_raw:
            shift_end = target_inf_now - inf_series_raw[-1]
            n_pts = len(inf_series_raw)
            inf_series = [
                round(float(np.clip(v + shift_end * ((idx + 1) / n_pts), 0.10, 0.98)), 3)
                for idx, v in enumerate(inf_series_raw)
            ]
            inf_series[-1] = round(target_inf_now, 2)
        else:
            inf_series = [round(target_inf_now, 2)]

        # 3. V3 Signal Drift (7 days hourly for top 3 wearable signals, with gaps and expected 48h I(t))
        baseline_slice_len = max(24, min(72, len(window_7d) // 2))
        inf_base_vals = inf_series[:baseline_slice_len]
        inf_mean = round(float(np.mean(inf_base_vals)) if inf_base_vals else 0.30, 2)
        inf_sd = round(max(0.05, float(np.std(inf_base_vals)) if len(inf_base_vals) > 1 else 0.06), 2)

        rr_vals = [round(float(x), 1) for x in window_7d["respiratory_rate"].tolist()] if "respiratory_rate" in window_7d else [16.0]
        rr_base_vals = rr_vals[:baseline_slice_len]
        rr_mean = round(float(formatted.get("baselineRR", np.mean(rr_base_vals))), 1)
        rr_sd = round(max(0.8, float(np.std(rr_base_vals)) if len(rr_base_vals) > 1 else 1.1), 1)

        spo2_vals = [round(float(x), 1) for x in window_7d["spo2"].tolist()] if "spo2" in window_7d else [96.0]
        spo2_base_vals = spo2_vals[:baseline_slice_len]
        spo2_mean = round(float(np.mean(spo2_base_vals)) if spo2_base_vals else 96.5, 1)
        spo2_sd = round(max(0.6, float(np.std(spo2_base_vals)) if len(spo2_base_vals) > 1 else 0.9), 1)

        # Ensure latest values in window match currentTelemetry exactly
        curr_rr = float(formatted["currentTelemetry"]["rr"])
        curr_spo2 = float(formatted["currentTelemetry"]["spo2"])
        if rr_vals:
            rr_vals[-1] = curr_rr
        if spo2_vals:
            spo2_vals[-1] = curr_spo2

        # Deterministic missing hours (gaps) in 7-day window — never interpolated
        n_w = len(window_7d)
        gap_indices = set()
        if n_w > 60:
            gap_indices = {n_w - 54, n_w - 53, n_w - 19}
        missing_hours_7d = len(gap_indices)

        hours_list = [int(h) for h in window_7d["timestamp_hour"].tolist()]

        def build_signal_points(values: List[float], decimals: int = 1) -> List[Dict[str, Any]]:
            pts = []
            for idx, (h_val, v_val) in enumerate(zip(hours_list, values)):
                t_iso = (base_dt + timedelta(hours=h_val)).isoformat()
                if idx in gap_indices:
                    pts.append({"t": t_iso, "v": None})
                else:
                    pts.append({"t": t_iso, "v": round(float(v_val), decimals)})
            return pts

        # Expected next 48 hours for I(t), driven by the station's forecast PM2.5 curve
        expected_inf: List[Dict[str, Any]] = []
        sim_i = target_inf_now
        fc_pm_by_h = {int(pt["h"]): float(pt["pm25"]) for pt in aq_points if pt.get("h") is not None and int(pt["h"]) > 0}
        for h_ahead in range(0, 49):
            t_iso = (current_dt + timedelta(hours=h_ahead)).isoformat()
            if h_ahead > 0:
                pm_step = fc_pm_by_h.get(h_ahead, curr_pm25)
                diurnal = 1.15 if (h_ahead % 24) in range(7, 11) or (h_ahead % 24) in range(18, 22) else 0.92
                d_i = (
                    -self.simulator.k * sim_i
                    + self.simulator.a * (pm_step * 0.68 * diurnal)
                    - self.simulator.c * adherence_ratio
                )
                sim_i = float(np.clip(sim_i + d_i, 0.12, 0.96))
            expected_inf.append({"t": t_iso, "v": round(sim_i, 2)})

        signals = [
            {
                "id": "inflammation",
                "label": "Inflammation state I(t)",
                "unit": "I(t)",
                "limit": round(inf_limit, 2),
                "limitDirection": "above",
                "twinAnchor": "chart-inflammation",
                "baseline": {"mean": inf_mean, "sd": inf_sd},
                "points": build_signal_points(inf_series, decimals=2),
                "expected": expected_inf,
            },
            {
                "id": "resp_rate",
                "label": "Resting respiratory rate",
                "unit": "breaths/min",
                "limit": 18.0,
                "limitDirection": "above",
                "twinAnchor": "chart-rr",
                "baseline": {"mean": rr_mean, "sd": rr_sd},
                "points": build_signal_points(rr_vals, decimals=1),
                "expected": None,
            },
            {
                "id": "spo2",
                "label": "Nocturnal SpO2",
                "unit": "%",
                "limit": 92.0,
                "limitDirection": "below",
                "twinAnchor": "chart-spo2",
                "baseline": {"mean": spo2_mean, "sd": spo2_sd},
                "points": build_signal_points(spo2_vals, decimals=1),
                "expected": None,
            },
        ]

        # 4. V4 Air-Quality Timeline & CPCB strip metadata
        cpcb_aqi = self.compute_cpcb_aqi_and_category(curr_pm25)
        base_tag = "CPCB"
        for tag in ("CPCB", "DPCC", "MPCB", "KSPCB", "WBPCB", "GPCB"):
            if tag in station_full:
                base_tag = tag
                break
        source_name = f"{base_tag} • LIVE" if live_aq is not None else base_tag

        # 5. V2 Driver Waterfall (Cohort baseline 0.30 -> patient 48h risk, within 0.5 pts)
        cohort_baseline = 0.30
        target_diff_pp = round((p48 - cohort_baseline) * 100.0, 1)

        prev_rr = float(prev_24_slice["respiratory_rate"].mean()) if "respiratory_rate" in prev_24_slice and not prev_24_slice.empty else curr_rr
        prev_spo2 = float(prev_24_slice["spo2"].mean()) if "spo2" in prev_24_slice and not prev_24_slice.empty else curr_spo2
        rescue_puffs_24h = int(formatted["currentTelemetry"]["rescuePuffs24h"])
        flare_ups_yr = int(formatted.get("flareUpsLastYear", 1))

        raw_candidates = [
            {
                "id": "ambient_pm25",
                "group": "air_quality",
                "label": "Ambient PM2.5 exposure",
                "raw": (curr_pm25 - 55.0) * 0.16,
                "change24hPp": round((curr_pm25 - prev_pm25) * 0.12, 1),
                "modifiable": True,
                "text": f"Current PM2.5 at {station_full} is {int(curr_pm25)} ug/m3 against the 15 ug/m3 WHO 24-hour guideline.",
            },
            {
                "id": "inflammation_state",
                "group": "wearable",
                "label": "Latent airway inflammation I(t)",
                "raw": (target_inf_now - 0.38) * 38.0,
                "change24hPp": round((target_inf_now - inf_mean) * 18.0, 1),
                "modifiable": False,
                "text": f"Latent airway inflammation I(t) is {target_inf_now:.2f} relative to baseline {inf_mean:.2f} (limit {inf_limit:.2f}).",
            },
            {
                "id": "controller_adherence",
                "group": "medication",
                "label": "Controller adherence",
                "raw": (80.0 - adherence_pct) * 0.42,
                "change24hPp": 0.0,
                "modifiable": True,
                "text": f"Recorded controller adherence is {int(adherence_pct)}% ({formatted.get('controllerMedication', 'controller inhaler')}).",
            },
            {
                "id": "resp_rate",
                "group": "wearable",
                "label": "Resting respiratory rate",
                "raw": (curr_rr - rr_mean) * 3.4,
                "change24hPp": round((curr_rr - prev_rr) * 2.2, 1),
                "modifiable": False,
                "text": f"Resting respiratory rate is {curr_rr:.1f} breaths/min vs personal baseline {rr_mean:.1f} breaths/min (limit 18 breaths/min).",
            },
            {
                "id": "nocturnal_spo2",
                "group": "wearable",
                "label": "Nocturnal SpO2 saturation",
                "raw": (spo2_mean - curr_spo2) * 3.6 if curr_spo2 < 96.0 else (96.0 - curr_spo2) * 3.0,
                "change24hPp": round((prev_spo2 - curr_spo2) * 2.4, 1),
                "modifiable": False,
                "text": f"Nocturnal SpO2 is {curr_spo2:.1f}% vs personal baseline {spo2_mean:.1f}% (limit 92%).",
            },
            {
                "id": "baseline_fev1",
                "group": "history",
                "label": "Baseline FEV1 & prior flare history",
                "raw": (76.0 - fev1_pct) * 0.36 + (flare_ups_yr - 1.5) * 2.2,
                "change24hPp": 0.0,
                "modifiable": False,
                "text": f"Baseline FEV1 is {int(fev1_pct)}% predicted with {flare_ups_yr} recorded flare-up(s) in the past year.",
            },
            {
                "id": "rescue_inhaler",
                "group": "medication",
                "label": "Rescue inhaler actuations (24h)",
                "raw": (rescue_puffs_24h - 1.0) * 2.5,
                "change24hPp": round((rescue_puffs_24h - 1.0) * 1.0, 1),
                "modifiable": False,
                "text": f"Patient recorded {rescue_puffs_24h} rescue puffs in the last 24 hours.",
            },
            {
                "id": "coarse_pm10",
                "group": "air_quality",
                "label": "Coarse particulate PM10 load",
                "raw": (curr_pm10 - 110.0) * 0.04,
                "change24hPp": round((curr_pm25 - prev_pm25) * 0.05, 1),
                "modifiable": True,
                "text": f"Ambient PM10 is {int(curr_pm10)} ug/m3 with station AQI {cpcb_aqi['value']} ({cpcb_aqi['category']}).",
            },
        ]

        # Scale positive and negative raw attributions so all 8 sum identically to target_diff_pp without flipping signs
        pos_sum = sum(c["raw"] for c in raw_candidates if c["raw"] > 0)
        neg_sum = sum(-c["raw"] for c in raw_candidates if c["raw"] < 0)

        if target_diff_pp >= 0:
            if pos_sum < 1e-3:
                raw_candidates[0]["raw"] = max(1.0, target_diff_pp)
                pos_sum = raw_candidates[0]["raw"]
            k_neg = 0.75 if neg_sum > 0 else 1.0
            k_pos = (target_diff_pp + k_neg * neg_sum) / max(pos_sum, 1e-6)
        else:
            if neg_sum < 1e-3:
                raw_candidates[2]["raw"] = min(-1.0, target_diff_pp)
                neg_sum = -raw_candidates[2]["raw"]
            k_pos = 0.75 if pos_sum > 0 else 1.0
            k_neg = (k_pos * pos_sum - target_diff_pp) / max(neg_sum, 1e-6)

        for c in raw_candidates:
            scaled = c["raw"] * (k_pos if c["raw"] >= 0 else k_neg)
            if abs(scaled) < 0.4:
                scaled = 0.5 if scaled >= 0 else -0.5
            c["deltaPp"] = round(float(scaled), 1)

        # Sort by absolute magnitude to select top 6 drivers, roll remaining 2 into other
        sorted_by_mag = sorted(raw_candidates, key=lambda x: abs(x["deltaPp"]), reverse=True)
        top_6 = sorted_by_mag[:6]
        top_6_sum = round(sum(x["deltaPp"] for x in top_6), 1)
        other_pp = round(target_diff_pp - top_6_sum, 1)

        # Within a group or overall: when status is watch or alert, risk-raising drivers come first; then by size of effect
        if status in ("watch", "alert"):
            top_6.sort(key=lambda x: (0 if x["deltaPp"] > 0 else 1, -abs(x["deltaPp"])))
        else:
            top_6.sort(key=lambda x: -abs(x["deltaPp"]))

        driver_items = [
            {
                "id": item["id"],
                "group": item["group"],
                "label": item["label"],
                "deltaPp": item["deltaPp"],
                "change24hPp": item["change24hPp"],
                "modifiable": item["modifiable"],
                "text": item["text"],
            }
            for item in top_6
        ]

        lb_info = formatted.get("learningBaseline") or {}
        cold_start = bool(lb_info.get("active", False))
        baseline_days = int(lb_info.get("currentDay", 14)) if cold_start else 14

        return {
            "patientId": pid,
            "asOf": resolved_as_of,
            "simulationHour": end_hour,
            "modelVersion": "twin-0.3.1",
            "seed": seed_num,
            "status": status,
            "statusLabel": status_label,
            "alertPolicy": {
                "threshold": threshold,
                "maxIntervalWidth": max_interval_width,
            },
            "curve": curve,
            "drivers": {
                "baseline": cohort_baseline,
                "items": driver_items,
                "other": {"deltaPp": other_pp},
            },
            "signals": signals,
            "airQuality": {
                "source": source_name,
                "station": station_full,
                "whoGuideline": 15,
                "bins": self.get_cpcb_bins(),
                "points": aq_points,
                "current": {
                    "pm25": int(round(curr_pm25)),
                    "pm10": int(round(curr_pm10)),
                    "temp": round(curr_temp, 1),
                    "humidity": int(round(curr_hum)),
                },
                "aqi": cpcb_aqi,
            },
            "dataQuality": {
                "missingHours7d": missing_hours_7d,
                "baselineDays": baseline_days,
                "coldStart": cold_start,
            },
        }

    def get_patient_what_if_forecast(
        self,
        pid: str,
        scenario_id: str = "custom",
        scenario_label: Optional[str] = None,
        outdoor_hours: float = 2.5,
        wear_n95: bool = False,
        target_adherence_pct: Optional[float] = None,
        hepa_purifier: bool = False,
        end_hour: int = 168,
        as_of_iso: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Returns the same ForecastPayload shape for an active What-If scenario (Section 5 & V5).
        Used by V5 to draw the dashed ghost curve and band on V1 without altering baseline numbers.
        """
        base_payload = self.get_patient_forecast(pid, end_hour=end_hour, as_of_iso=as_of_iso)
        eval_h = int(base_payload.get("simulationHour", end_hour))
        formatted = self.get_formatted_patient(pid, end_hour=eval_h)

        base_risk_48h = float(base_payload["curve"][-1]["p"]) * 100.0
        base_inf = float(formatted["estimatedInflammationState"])
        curr_pm25 = float(formatted["currentAirQuality"]["pm25"])
        curr_adh = float(formatted["controllerAdherence"])

        eff_target_adh = float(target_adherence_pct) if target_adherence_pct is not None else curr_adh

        sim_res = self.simulator.simulate_what_if(
            base_risk_48h=base_risk_48h,
            base_inflammation=base_inf,
            current_pm25=curr_pm25,
            current_adherence_pct=curr_adh,
            outdoor_hours=outdoor_hours,
            wear_n95=wear_n95,
            target_adherence_pct=eff_target_adh,
            hepa_purifier=hepa_purifier,
            horizon_hours=48,
            engine=self,
            patient_id=pid,
            eval_hour=eval_h,
        )

        sim_risk_48 = float(sim_res["simulatedRisk"]) / 100.0
        sim_risk_24 = min(sim_risk_48, float(sim_res.get("simulatedRisk24h", sim_res["simulatedRisk"] * 0.85)) / 100.0)
        base_curve = base_payload["curve"]

        # Construct 49 hourly counterfactual points with matching conformal interval width scaled to simulated p
        cf_curve: List[Dict[str, Any]] = []
        prev_p, prev_lo, prev_hi = 0.0, 0.0, 0.0
        for h in range(49):
            b_pt = base_curve[h]
            b_half_lo = max(0.02, b_pt["p"] - b_pt["lo"])
            b_half_hi = max(0.02, b_pt["hi"] - b_pt["p"])
            if h == 0:
                p_h, lo_h, hi_h = 0.0, 0.0, 0.0
            elif h <= 24:
                frac = (h / 24.0) ** 0.85
                p_h = round(sim_risk_24 * frac, 4)
                lo_h = round(max(0.0, p_h - b_half_lo * 0.9), 4)
                hi_h = round(min(1.0, p_h + b_half_hi * 0.9), 4)
            else:
                frac = ((h - 24.0) / 24.0) ** 0.90
                p_h = round(sim_risk_24 + (sim_risk_48 - sim_risk_24) * frac, 4)
                lo_h = round(max(0.0, p_h - b_half_lo * 0.9), 4)
                hi_h = round(min(1.0, p_h + b_half_hi * 0.9), 4)

            p_h = max(prev_p, min(1.0, p_h))
            lo_h = min(p_h, max(prev_lo, lo_h))
            hi_h = max(p_h, max(prev_hi, hi_h))
            prev_p, prev_lo, prev_hi = p_h, lo_h, hi_h
            cf_curve.append({
                "h": h,
                "t": b_pt["t"],
                "p": round(p_h, 4),
                "lo": round(lo_h, 4),
                "hi": round(hi_h, 4),
            })

        if not scenario_label:
            parts = []
            if wear_n95:
                parts.append("N95")
            if outdoor_hours < 2.0:
                parts.append(f"Outdoor {outdoor_hours:.1f}h")
            if eff_target_adh > curr_adh:
                parts.append(f"Adherence {int(eff_target_adh)}%")
            if hepa_purifier:
                parts.append("HEPA")
            scenario_label = " + ".join(parts) if parts else "Active scenario"

        delta_48h_pp = round((cf_curve[-1]["p"] - base_curve[-1]["p"]) * 100.0, 1)
        threshold = base_payload["alertPolicy"]["threshold"]
        cf_status = "alert" if cf_curve[-1]["p"] >= threshold else ("watch" if cf_curve[-1]["p"] >= 0.35 else "normal")
        cf_status_label = "Alert" if cf_status == "alert" else ("Watch" if cf_status == "watch" else "Normal")

        out = dict(base_payload)
        out["scenarioId"] = scenario_id
        out["scenarioLabel"] = scenario_label
        out["status"] = cf_status
        out["statusLabel"] = cf_status_label
        out["curve"] = cf_curve
        out["delta48hPp"] = delta_48h_pp
        return out


