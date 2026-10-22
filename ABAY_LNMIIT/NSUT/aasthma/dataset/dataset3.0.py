import os
import numpy as np
import pandas as pd

def generate_multimodal_telemetry(num_patients=50, num_hours=240, output_path="data/dynamic/timeseries.tsv"):
    """
    Generates a 240-hour continuous dynamic dataset combining:
    1. 5 Core Micro-Acoustic Channels (Preserved existing setup)
    2. 6 New DSP Audio & Vocal Features (STFT & Spectral Analysis)
    3. 10 MediaPipe FaceMesh Keypoint Features (Normalized by IPD: P33 to P263)
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
                # =========================================================
                # EXACERBATION STATE (Airway Inflammation & Respiratory Distress)
                # =========================================================

                # --- A. 5 CORE MICRO-ACOUSTIC FEATURES (PRESERVED) ---
                hourly_cough_count = np.random.randint(10, 42) if is_night else np.random.randint(5, 22)
                wheeze_percent_duration = np.random.uniform(28.0, 68.0)
                resp_rate = base_resp_rate + np.random.uniform(6.0, 11.0) # Tachypnea
                hr = base_hr + np.random.uniform(16.0, 28.0)              # Tachycardia
                hrv = base_hrv - np.random.uniform(18.0, 28.0)            # Autonomic stress

                # --- B. 6 ADDITIONAL DSP AUDIO & VOCAL FEATURES ---
                sputum_severity = np.random.choice([1, 2, 3], p=[0.2, 0.5, 0.3])
                breathlessness_score = np.random.choice([3, 4, 5], p=[0.3, 0.5, 0.2])
                stridor_idx = np.random.uniform(0.45, 0.88)
                snore_score = np.random.uniform(5.0, 9.5) if is_night else np.random.uniform(0.5, 2.5)
                vocal_jitter_pct = np.random.uniform(2.8, 5.5)
                speech_wpm = np.random.uniform(65.0, 105.0)

                # --- C. 10 MEDIAPIPE FACEMESH KEYPOINT FEATURES (IPD-NORMALIZED) ---
                mouth_breathing_ratio = np.random.uniform(0.45, 0.85)     # MAR > 0.35 threshold
                nasal_flaring_index = np.random.uniform(0.45, 0.78)      # Outer nostril alar expansion
                brow_strain_score = np.random.uniform(0.55, 0.90)        # Corrugator muscle contraction
                head_bobbing_amplitude = np.random.uniform(0.35, 0.75)   # Rhythmic vertical dipping
                video_respiratory_rate = resp_rate + np.random.normal(0, 0.5)
                yawn_sigh_count = np.random.randint(2, 8) if is_night else np.random.randint(1, 5)
                blink_rate_bpm = np.random.uniform(25.0, 42.0)           # High ocular blink rate
                forehead_rppg_heart_rate = hr + np.random.normal(0, 1.2)
                jaw_slack_index = np.random.uniform(0.35, 0.65)         # Facial muscle tone loss
                gaze_instability_score = np.random.uniform(0.28, 0.58)  # Iris velocity variance

            else:
                # =========================================================
                # NORMAL BASELINE STATE
                # =========================================================

                # --- A. 5 CORE MICRO-ACOUSTIC FEATURES (PRESERVED) ---
                hourly_cough_count = np.random.choice([0, 1, 2, 3], p=[0.65, 0.20, 0.10, 0.05])
                wheeze_percent_duration = np.random.uniform(0.0, 4.5)
                resp_rate = base_resp_rate + np.random.uniform(-1.0, 1.0)
                hr = base_hr + np.random.uniform(-4.0, 4.0)
                hrv = base_hrv + np.random.uniform(-3.5, 3.5)

                # --- B. 6 ADDITIONAL DSP AUDIO & VOCAL FEATURES ---
                sputum_severity = np.random.choice([0, 1], p=[0.85, 0.15])
                breathlessness_score = np.random.choice([0, 1], p=[0.80, 0.20])
                stridor_idx = np.random.uniform(0.0, 0.15)
                snore_score = np.random.uniform(0.5, 3.5) if is_night else np.random.uniform(0.0, 0.5)
                vocal_jitter_pct = np.random.uniform(0.6, 1.4)
                speech_wpm = np.random.uniform(130.0, 175.0)

                # --- C. 10 MEDIAPIPE FACEMESH KEYPOINT FEATURES (IPD-NORMALIZED) ---
                mouth_breathing_ratio = np.random.uniform(0.08, 0.22)
                nasal_flaring_index = np.random.uniform(0.15, 0.28)
                brow_strain_score = np.random.uniform(0.02, 0.15)
                head_bobbing_amplitude = np.random.uniform(0.02, 0.10)
                video_respiratory_rate = resp_rate + np.random.normal(0, 0.5)
                yawn_sigh_count = np.random.choice([0, 1], p=[0.8, 0.2])
                blink_rate_bpm = np.random.uniform(12.0, 20.0)
                forehead_rppg_heart_rate = hr + np.random.normal(0, 1.0)
                jaw_slack_index = np.random.uniform(0.05, 0.18)
                gaze_instability_score = np.random.uniform(0.01, 0.08)

            row = {
                "patient_id": pid,
                "timestamp_hour": h,

                # --- 1. PRESERVED CORE ACOUSTIC FEATURES (5) ---
                "hourly_cough_count": int(hourly_cough_count),
                "wheeze_percent_duration": round(float(wheeze_percent_duration), 2),
                "respiratory_rate_brpm": round(float(resp_rate), 1),
                "heart_rate_bpm": round(float(hr), 1),
                "hrv_rmssd_ms": round(float(np.clip(hrv, 10.0, 100.0)), 1),

                # --- 2. NEW DSP AUDIO & VOCAL FEATURES (6) ---
                "sputum_severity": int(sputum_severity),
                "breathlessness_score": int(breathlessness_score),
                "stridor_detection_index": round(float(stridor_idx), 3),
                "snoring_nocturnal_score": round(float(snore_score), 2),
                "vocal_hoarseness_jitter": round(float(vocal_jitter_pct), 3),
                "speech_rate_wpm": round(float(speech_wpm), 1),

                # --- 3. MEDIAPIPE FACEMESH KEYPOINT FEATURES (10) ---
                "mouth_breathing_ratio": round(float(mouth_breathing_ratio), 3),
                "nasal_flaring_index": round(float(nasal_flaring_index), 3),
                "brow_strain_score": round(float(brow_strain_score), 3),
                "head_bobbing_amplitude": round(float(head_bobbing_amplitude), 3),
                "video_respiratory_rate": round(float(video_respiratory_rate), 1),
                "yawn_sigh_count": int(yawn_sigh_count),
                "blink_rate_bpm": round(float(blink_rate_bpm), 1),
                "forehead_rppg_heart_rate": round(float(forehead_rppg_heart_rate), 1),
                "jaw_slack_index": round(float(jaw_slack_index), 3),
                "gaze_instability_score": round(float(gaze_instability_score), 3)
            }
            data_rows.append(row)

    df = pd.DataFrame(data_rows)
    df.to_csv(output_path, sep="\t", index=False)

    print(f" Generated {len(df)} dynamic telemetry rows across {num_patients} patients at: {output_path}")
    print(f" Total Dynamic Features: {len(df.columns) - 2} Channels\n")
    print("Channel Breakdown:")
    print("  • Preserved Acoustic (5): hourly_cough_count, wheeze_percent_duration, respiratory_rate_brpm, heart_rate_bpm, hrv_rmssd_ms")
    print("  • DSP Audio/Vocal (6):    sputum_severity, breathlessness_score, stridor_detection_index, snoring_nocturnal_score, vocal_hoarseness_jitter, speech_rate_wpm")
    print("  • FaceMesh Keypoint (10): mouth_breathing_ratio, nasal_flaring_index, brow_strain_score, head_bobbing_amplitude, video_respiratory_rate, yawn_sigh_count, blink_rate_bpm, forehead_rppg_heart_rate, jaw_slack_index, gaze_instability_score")
    return df

if __name__ == "__main__":
    generate_multimodal_telemetry()