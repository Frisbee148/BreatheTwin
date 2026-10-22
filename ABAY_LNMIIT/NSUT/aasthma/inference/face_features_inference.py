import time
import threading
import collections
import cv2
import numpy as np
import scipy.signal as signal
import mediapipe as mp

class LiveFaceFeaturePipeline:
    def __init__(self, camera_index=0, hourly_window_seconds=3600):
        self.camera_index = camera_index
        self.hourly_window_seconds = hourly_window_seconds
        self.running = False
        self.lock = threading.Lock()

        # Initialize MediaPipe FaceMesh (468 3D Landmarks)
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,  # Enables iris keypoints 468 & 473
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

        # Short Real-Time Buffers for Signal Filtering (10-second window at ~30 FPS)
        self.buffer_len = 300
        self.nose_y_history = collections.deque(maxlen=self.buffer_len)
        self.forehead_green_history = collections.deque(maxlen=self.buffer_len)
        self.iris_velocity_history = collections.deque(maxlen=90) # 3-second window

        # 1-Hour Rolling History Buffers (Stores 1-second metric snapshots)
        self.history_len = hourly_window_seconds
        self.history_mar = collections.deque(maxlen=self.history_len)
        self.history_flaring = collections.deque(maxlen=self.history_len)
        self.history_brow_strain = collections.deque(maxlen=self.history_len)
        self.history_head_bobbing = collections.deque(maxlen=self.history_len)
        self.history_video_rr = collections.deque(maxlen=self.history_len)
        self.history_yawn_flags = collections.deque(maxlen=self.history_len)
        self.history_blink_flags = collections.deque(maxlen=self.history_len)
        self.history_forehead_hr = collections.deque(maxlen=self.history_len)
        self.history_jaw_slack = collections.deque(maxlen=self.history_len)
        self.history_gaze_instability = collections.deque(maxlen=self.history_len)

        # Baseline ratios for calibration
        self.baseline_brow_dist = None

    def _video_ingestion_worker(self):
        """
        Background thread capturing webcam frames and extracting
        IPD-normalized 3D FaceMesh keypoint features.
        """
        cap = cv2.VideoCapture(self.camera_index)
        last_process_time = time.time()
        prev_iris_pos = None

        while self.running and cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.01)
                continue

            h, w, c = frame.shape
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.face_mesh.process(rgb_frame)

            if results.multi_face_landmarks:
                landmarks = results.multi_face_landmarks[0].landmark

                # Convert landmark points to numpy 3D array
                pts = np.array([[lm.x * w, lm.y * h, lm.z * w] for lm in landmarks])

                # -------------------------------------------------------------
                # 1. IPD NORMALIZATION BASELINE (P33 Outer Left to P263 Outer Right)
                # -------------------------------------------------------------
                ipd = np.linalg.norm(pts[33] - pts[263]) + 1e-6

                # Feature 1: Mouth Aspect Ratio (MAR) -> Mouth Breathing
                mar = np.linalg.norm(pts[13] - pts[14]) / (np.linalg.norm(pts[61] - pts[291]) + 1e-6)

                # Feature 2: Nasal Flaring Index
                flaring_index = np.linalg.norm(pts[250] - pts[470]) / ipd

                # Feature 3: Brow Strain Score (Inner eyebrows P55 to P285)
                brow_dist = np.linalg.norm(pts[55] - pts[285]) / ipd
                if self.baseline_brow_dist is None:
                    self.baseline_brow_dist = brow_dist
                brow_strain = float(np.clip(1.0 - (brow_dist / (self.baseline_brow_dist + 1e-6)), 0.0, 1.0))

                # Feature 4 & 5: Head Displacement Tracking (Nose Tip P1, Nose Bridge P6, Chin P152)
                nose_y_norm = (pts[1, 1] - pts[152, 1]) / ipd
                self.nose_y_history.append(pts[6, 1]) # Unnormalized Y for bandpass filter

                # Feature 7: Eye Aspect Ratio (EAR) -> Blinking Rate
                ear_left = np.linalg.norm(pts[159] - pts[145]) / (2.0 * np.linalg.norm(pts[33] - pts[133]) + 1e-6)
                blink_flag = 1 if ear_left < 0.20 else 0

                # Feature 8: Forehead rPPG Pulse Signal (Green channel mean)
                cx, cy = int(pts[10, 0]), int(pts[10, 1])
                roi = frame[max(0, cy-15):min(h, cy+15), max(0, cx-15):min(w, cx+15)]
                if roi.size > 0:
                    mean_green = float(np.mean(roi[:, :, 1]))
                    self.forehead_green_history.append(mean_green)

                # Feature 9: Jaw Slack Index
                jaw_slack = (pts[152, 1] - ((pts[234, 1] + pts[454, 1]) / 2.0)) / ipd

                # Feature 10: Gaze Instability Score (Iris P468 velocity)
                iris_pos = pts[468, :2]
                if prev_iris_pos is not None:
                    iris_vel = np.linalg.norm(iris_pos - prev_iris_pos) / ipd
                    self.iris_velocity_history.append(iris_vel)
                prev_iris_pos = iris_pos

                # -------------------------------------------------------------
                # SECOND-BY-SECOND AGGREGATION & FILTERING
                # -------------------------------------------------------------
                current_time = time.time()
                if current_time - last_process_time >= 1.0:
                    last_process_time = current_time

                    # Calculate Head Bobbing Peak-to-Peak Amplitude over 1s
                    bobbing_amp = float((np.max(self.nose_y_history) - np.min(self.nose_y_history)) / ipd) if len(self.nose_y_history) > 10 else 0.05

                    # Video Respiratory Rate via Bandpass Filter (0.15Hz - 0.60Hz -> 9-36 BRPM)
                    if len(self.nose_y_history) >= 150:
                        y_arr = np.array(self.nose_y_history)
                        b_rr, a_rr = signal.butter(2, [0.15 / 15.0, 0.60 / 15.0], btype='band')
                        filt_y = signal.lfilter(b_rr, a_rr, y_arr)
                        peaks, _ = signal.find_peaks(filt_y, distance=10)
                        video_rr = float(np.clip(len(peaks) * 4.0, 10.0, 40.0))
                    else:
                        video_rr = 16.0

                    # Forehead rPPG Heart Rate via FFT Peak (0.75Hz - 2.5Hz -> 45-150 BPM)
                    if len(self.forehead_green_history) >= 150:
                        g_arr = np.array(self.forehead_green_history)
                        b_hr, a_hr = signal.butter(2, [0.75 / 15.0, 2.5 / 15.0], btype='band')
                        filt_g = signal.lfilter(b_hr, a_hr, g_arr)
                        fft_vals = np.abs(np.fft.rfft(filt_g))
                        fft_freqs = np.fft.rfftfreq(len(filt_g), d=1.0/30.0)
                        valid_idx = np.where((fft_freqs >= 0.75) & (fft_freqs <= 2.5))[0]
                        if len(valid_idx) > 0:
                            peak_freq = fft_freqs[valid_idx[np.argmax(fft_vals[valid_idx])]]
                            rppg_hr = float(np.clip(peak_freq * 60.0, 50.0, 140.0))
                        else:
                            rppg_hr = 72.0
                    else:
                        rppg_hr = 72.0

                    # Gaze Instability (Standard Deviation of Iris Velocity)
                    gaze_instability = float(np.std(self.iris_velocity_history)) if len(self.iris_velocity_history) > 10 else 0.02

                    # Yawn/Sigh Detection (MAR > 0.65)
                    yawn_flag = 1 if mar > 0.65 else 0

                    # Append to Thread-Safe Rolling Hourly History
                    with self.lock:
                        self.history_mar.append(mar)
                        self.history_flaring.append(flaring_index)
                        self.history_brow_strain.append(brow_strain)
                        self.history_head_bobbing.append(bobbing_amp)
                        self.history_video_rr.append(video_rr)
                        self.history_yawn_flags.append(yawn_flag)
                        self.history_blink_flags.append(blink_flag)
                        self.history_forehead_hr.append(rppg_hr)
                        self.history_jaw_slack.append(jaw_slack)
                        self.history_gaze_instability.append(gaze_instability)

            time.sleep(0.02) # ~30 FPS loop

        cap.release()

    def start_recording(self):
        """Starts live webcam frame processing in the background."""
        self.running = True
        self.worker_thread = threading.Thread(target=self._video_ingestion_worker, daemon=True)
        self.worker_thread.start()
        print("🎥 Real-Time Live Face Mesh Pipeline Started. Tracking landmarks...")

    def stop_recording(self):
        """Stops live video processing."""
        self.running = False
        print("🛑 Real-Time Live Face Mesh Pipeline Stopped.")

    def get_latest_hourly_telemetry(self):
        """
        Aggregates all buffered metrics across the last 1-hour (3600 seconds) rolling window
        and returns the exact 10 dynamic keypoint feature values ready for RespiTwin.
        """
        with self.lock:
            total_seconds = len(self.history_mar)
            if total_seconds == 0:
                # Return default resting baselines if buffer is empty
                return {
                    "mouth_breathing_ratio": 0.12,
                    "nasal_flaring_index": 0.20,
                    "brow_strain_score": 0.05,
                    "head_bobbing_amplitude": 0.05,
                    "video_respiratory_rate": 16.0,
                    "yawn_sigh_count": 0,
                    "blink_rate_bpm": 15.0,
                    "forehead_rppg_heart_rate": 72.0,
                    "jaw_slack_index": 0.10,
                    "gaze_instability_score": 0.03
                }

            # 1. Mouth Breathing Ratio (Percentage of oral breathing frames)
            oral_frames = np.sum(np.array(self.history_mar) > 0.35)
            mouth_breathing_ratio = float(oral_frames / total_seconds)

            # 2. Nasal Flaring Index Mean
            mean_flaring = float(np.mean(self.history_flaring))

            # 3. Brow Strain Score Mean
            mean_brow_strain = float(np.mean(self.history_brow_strain))

            # 4. Head Bobbing Amplitude Mean
            mean_head_bobbing = float(np.mean(self.history_head_bobbing))

            # 5. Video Respiratory Rate Mean
            mean_video_rr = float(np.mean(self.history_video_rr))

            # 6. Yawn and Sigh Count (Extrapolated to hourly scale)
            scale_factor = 3600.0 / total_seconds
            total_yawns = int(np.sum(self.history_yawn_flags) * scale_factor)

            # 7. Blink Rate BPM (Blinks per minute)
            blink_rate_bpm = float((np.sum(self.history_blink_flags) / total_seconds) * 60.0)

            # 8. Forehead rPPG Heart Rate Mean
            mean_forehead_hr = float(np.mean(self.history_forehead_hr))

            # 9. Jaw Slack Index Mean
            mean_jaw_slack = float(np.mean(self.history_jaw_slack))

            # 10. Gaze Instability Score Mean
            mean_gaze_instability = float(np.mean(self.history_gaze_instability))

            return {
                "mouth_breathing_ratio": round(mouth_breathing_ratio, 3),
                "nasal_flaring_index": round(mean_flaring, 3),
                "brow_strain_score": round(mean_brow_strain, 3),
                "head_bobbing_amplitude": round(mean_head_bobbing, 3),
                "video_respiratory_rate": round(mean_video_rr, 1),
                "yawn_sigh_count": total_yawns,
                "blink_rate_bpm": round(blink_rate_bpm, 1),
                "forehead_rppg_heart_rate": round(mean_forehead_hr, 1),
                "jaw_slack_index": round(mean_jaw_slack, 3),
                "gaze_instability_score": round(mean_gaze_instability, 3)
            }


# ==========================================
# LIVE TEST RUN
# ==========================================
if __name__ == "__main__":
    import json

    pipeline = LiveFaceFeaturePipeline(camera_index=0)
    pipeline.start_recording()

    try:
        print("\n--- Live Webcam Processing Active ---")
        print("Look at your camera. Open your mouth, flare nostrils, or tilt head to test.")
        print("Printing updated rolling hourly face telemetry every 5 seconds...\n")

        for i in range(4): # Run test loop for 20 seconds
            time.sleep(5)
            telemetry = pipeline.get_latest_hourly_telemetry()
            print(f"--- [Snapshot at t={ (i+1)*5 }s] Rolling Hourly Face Telemetry ---")
            print(json.dumps(telemetry, indent=2))
            print("-" * 55)

    except KeyboardInterrupt:
        pass
    finally:
        pipeline.stop_recording()