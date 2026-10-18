import os
import numpy as np
import pandas as pd

def generate_strados_resp_telemetry(num_patients=50, num_hours=240, output_path="data/dynamic/timeseries.tsv"):
    """
    Generates a 240-hour continuous dynamic dataset capturing 5 primary features
    extracted from micro-acoustic respiratory biosensors (e.g., Strados RESP®):
    
      1. hourly_cough_count     : Total coughs per 1-hour window
      2. wheeze_percent_duration: % of breathing cycles with wheezing (400-1600 Hz)
      3. respiratory_rate_brpm  : Breaths per minute
      4. heart_rate_bpm         : Pulse rate
      5. hrv_rmssd_ms           : Heart Rate Variability (RMSSD)
    """
    np.random.seed(42)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    data_rows = []
    
    for pid_idx in range(num_patients):
        pid = f"PATIENT_{pid_idx + 1:03d}"
        
        # Baseline physiological metrics per patient
        base_resp_rate = np.random.uniform(12.5, 15.5)
        base_hr = np.random.uniform(62.0, 74.0)
        base_hrv = np.random.uniform(48.0, 68.0)
        
        # Randomly assign 0 to 2 exacerbation event windows per patient
        num_events = np.random.choice([0, 1, 2], p=[0.35, 0.45, 0.20])
        event_windows = []
        for _ in range(num_events):
            start_h = np.random.randint(24, num_hours - 48)
            duration = np.random.randint(12, 28)
            event_windows.append((start_h, start_h + duration))
            
        for h in range(num_hours):
            hour_of_day = h % 24
            is_night = hour_of_day >= 22 or hour_of_day <= 6
            
            # Check if current hour falls within an exacerbation window
            in_event = any(ev_start <= h <= ev_end for ev_start, ev_end in event_windows)
            
            if in_event:
                # --- EXACERBATION STATE (Airway Inflammation & Distress) ---
                # Acoustic Parameters
                hourly_cough_count = np.random.randint(10, 42) if is_night else np.random.randint(5, 22)
                wheeze_percent_duration = np.random.uniform(28.0, 68.0) # Elevated wheeze duration
                
                # Cardiopulmonary Telemetry
                resp_rate = base_resp_rate + np.random.uniform(6.0, 11.0) # Tachypnea
                hr = base_hr + np.random.uniform(16.0, 28.0)              # Tachycardia
                hrv = base_hrv - np.random.uniform(18.0, 28.0)            # Autonomic stress drop
            else:
                # --- NORMAL BASELINE STATE ---
                # Acoustic Parameters
                hourly_cough_count = np.random.choice([0, 1, 2, 3], p=[0.65, 0.20, 0.10, 0.05])
                wheeze_percent_duration = np.random.uniform(0.0, 4.5)
                
                # Cardiopulmonary Telemetry
                resp_rate = base_resp_rate + np.random.uniform(-1.0, 1.0)
                hr = base_hr + np.random.uniform(-4.0, 4.0)
                hrv = base_hrv + np.random.uniform(-3.5, 3.5)
            
            row = {
                "patient_id": pid,
                "timestamp_hour": h,
                
                # --- 5 CORE DYNAMIC FEATURES ---
                "hourly_cough_count": int(hourly_cough_count),
                "wheeze_percent_duration": round(float(wheeze_percent_duration), 2),
                "respiratory_rate_brpm": round(float(resp_rate), 1),
                "heart_rate_bpm": round(float(hr), 1),
                "hrv_rmssd_ms": round(float(np.clip(hrv, 10.0, 100.0)), 1)
            }
            data_rows.append(row)
            
    df = pd.DataFrame(data_rows)
    df.to_csv(output_path, sep="\t", index=False)
    print(f"✅ Generated {len(df)} dynamic telemetry rows across {num_patients} patients at: {output_path}")
    print(f"📊 Features included ({len(df.columns) - 2} dynamic channels):")
    print("   " + ", ".join([col for col in df.columns if col not in ["patient_id", "timestamp_hour"]]))
    return df

if __name__ == "__main__":
    generate_strados_resp_telemetry()