import time
import threading
import collections
import numpy as np
import librosa
import scipy.signal as signal
import tensorflow as tf
import tensorflow_hub as hub
import pyaudio

class LiveAudioFeaturePipeline:
    def __init__(self, sample_rate=16000, chunk_size=1024, hourly_window_seconds=3600):
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.hourly_window_seconds = hourly_window_seconds
        self.running = False
        self.lock = threading.Lock()

        # Load YamNet Model from TensorFlow Hub
        print("⏳ Loading YamNet Model for Real-Time Streaming...")
        self.yamnet_model = hub.load("https://tfhub.dev/google/yamnet/1")
        print("✅ YamNet Model Loaded Successfully.")

        # AudioSet Ontology Class Indices
        self.CLASS_COUGH = 47
        self.CLASS_WHEEZE = 50
        self.CLASS_SNORE = 48
        self.CLASS_SPEECH = 0
        self.CLASS_GASP = 51

        # Real-Time Short Audio Buffer (Stores last 3 seconds of raw audio)
        self.raw_audio_buffer = collections.deque(maxlen=self.sample_rate * 3)

        # 1-Hour Rolling History Buffers (Stores second-by-second metric snapshots)
        self.history_len = hourly_window_seconds
        self.history_cough_events = collections.deque(maxlen=self.history_len)
        self.history_wheeze_flags = collections.deque(maxlen=self.history_len)
        self.history_snore_scores = collections.deque(maxlen=self.history_len)
        self.history_rolloff_hz = collections.deque(maxlen=self.history_len)
        self.history_speech_flags = collections.deque(maxlen=self.history_len)
        self.history_gasp_scores = collections.deque(maxlen=self.history_len)
        self.history_stridor_indices = collections.deque(maxlen=self.history_len)
        self.history_jitter = collections.deque(maxlen=self.history_len)
        self.history_shimmer = collections.deque(maxlen=self.history_len)
        self.history_ambient_db = collections.deque(maxlen=self.history_len)
        self.history_wpm = collections.deque(maxlen=self.history_len)
        self.history_brpm = collections.deque(maxlen=self.history_len)

    def _audio_ingestion_worker(self):
        """
        Background thread that continuously captures raw mic audio
        and updates rolling 1-second window processing.
        """
        p = pyaudio.PyAudio()
        stream = p.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=self.sample_rate,
            input=True,
            frames_per_buffer=self.chunk_size
        )

        last_process_time = time.time()

        while self.running:
            # Read audio chunk from microphone
            data = stream.read(self.chunk_size, exception_on_overflow=False)
            audio_samples = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0

            # Append incoming chunk to raw 3-second live buffer
            self.raw_audio_buffer.extend(audio_samples)

            # Every 1.0 second, process the current 3-second buffer snapshot
            current_time = time.time()
            if current_time - last_process_time >= 1.0 and len(self.raw_audio_buffer) >= self.sample_rate:
                last_process_time = current_time
                self._process_1s_window(np.array(self.raw_audio_buffer))

        stream.stop_stream()
        stream.close()
        p.terminate()

    def _process_1s_window(self, audio_window):
        """
        Processes a 1-to-3 second live audio buffer through YamNet and STFT DSP.
        Appends extracted metric snapshots to the rolling hourly buffers.
        """
        # 1. YamNet Inference
        scores, embeddings, spectrogram = self.yamnet_model(audio_window)
        scores = scores.numpy() # Shape: [num_frames, 521]

        prob_cough = np.max(scores[:, self.CLASS_COUGH])
        prob_wheeze = np.max(scores[:, self.CLASS_WHEEZE])
        prob_snore = np.max(scores[:, self.CLASS_SNORE])
        prob_speech = np.max(scores[:, self.CLASS_SPEECH])
        prob_gasp = np.max(scores[:, self.CLASS_GASP])

        # 2. STFT & DSP Metrics
        n_fft = int(0.025 * self.sample_rate)
        hop_length = int(0.010 * self.sample_rate)
        stft = np.abs(librosa.stft(audio_window, n_fft=n_fft, hop_length=hop_length))
        freqs = librosa.fft_frequencies(sr=self.sample_rate, n_fft=n_fft)

        # Spectral Roll-off (Mucus / Sputum indicator)
        spectral_rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=audio_window, sr=self.sample_rate, roll_percent=0.85)[0]))

        # Stridor Energy Index (500Hz - 1500Hz ratio)
        stridor_mask = (freqs >= 500) & (freqs <= 1500)
        stridor_energy = np.sum(stft[stridor_mask, :]) / (np.sum(stft) + 1e-6)

        # Jitter & Shimmer via Pitch Autocorrelation
        f0, voiced_flag, voiced_probs = librosa.pyin(audio_window, fmin=75, fmax=600, sr=self.sample_rate)
        f0_clean = f0[~np.isnan(f0)] if f0 is not None else []

        if len(f0_clean) > 1:
            periods = 1.0 / f0_clean
            jitter = float(np.mean(np.abs(np.diff(periods))) / np.mean(periods) * 100)
            rms = librosa.feature.rms(y=audio_window, frame_length=n_fft, hop_length=hop_length)[0]
            shimmer = float(np.mean(np.abs(np.diff(rms))) / (np.mean(rms) + 1e-6) * 100)
        else:
            jitter, shimmer = 0.8, 2.5 # Baseline resting defaults

        # Ambient Noise Level
        rms_env = librosa.feature.rms(y=audio_window)[0]
        mean_rms = np.mean(rms_env) if len(rms_env) > 0 else 1e-5
        ambient_db = float(np.clip(20 * np.log10(mean_rms + 1e-6) + 90, 30.0, 85.0))

        # Update Thread-Safe Hourly Rolling History
        with self.lock:
            self.history_cough_events.append(1 if prob_cough > 0.50 else 0)
            self.history_wheeze_flags.append(1 if prob_wheeze > 0.35 else 0)
            self.history_snore_scores.append(prob_snore * 10.0)
            self.history_rolloff_hz.append(spectral_rolloff)
            self.history_speech_flags.append(1 if prob_speech > 0.30 else 0)
            self.history_gasp_scores.append(prob_gasp)
            self.history_stridor_indices.append(stridor_energy)
            self.history_jitter.append(jitter)
            self.history_shimmer.append(shimmer)
            self.history_ambient_db.append(ambient_db)

    def start_recording(self):
        """Starts live microphone listening and feature processing in the background."""
        self.running = True
        self.worker_thread = threading.Thread(target=self._audio_ingestion_worker, daemon=True)
        self.worker_thread.start()
        print("🎙️ Real-Time Live Microphone Pipeline Started. Monitoring audio...")

    def stop_recording(self):
        """Stops live recording."""
        self.running = False
        print("🛑 Real-Time Live Audio Pipeline Stopped.")

    def get_latest_hourly_telemetry(self):
        """
        Aggregates all buffered metrics across the last 1-hour (3600 seconds) rolling window
        and returns the exact 11 dynamic feature values ready for RespiTwin inference.
        """
        with self.lock:
            total_seconds = len(self.history_cough_events)
            if total_seconds == 0:
                # Return default resting baseline if buffer is empty
                return {
                    "hourly_cough_count": 0,
                    "wheeze_percent_duration": 0.0,
                    "sputum_severity": 0,
                    "breathlessness_score": 0,
                    "stridor_detection_index": 0.0,
                    "snoring_nocturnal_score": 0.0,
                    "vocal_hoarseness_jitter": 0.8,
                    "vocal_shimmer_score": 2.5,
                    "ambient_noise_decibels": 45.0,
                    "speech_rate_wpm": 130.0,
                    "respiratory_rate_brpm": 16.0
                }

            # 1. Total Cough Count (Extrapolated to hourly scale)
            scale_factor = 3600.0 / total_seconds
            total_coughs = int(np.sum(self.history_cough_events) * scale_factor)

            # 2. Wheeze Percent Duration (%)
            wheeze_pct = float((np.sum(self.history_wheeze_flags) / total_seconds) * 100.0)

            # 3. Sputum Severity (Derived from average roll-off on cough events)
            avg_rolloff = np.mean(self.history_rolloff_hz) if total_seconds > 0 else 2500
            if total_coughs == 0:
                sputum_sev = 0
            elif avg_rolloff < 1200:
                sputum_sev = 3
            elif avg_rolloff < 2200:
                sputum_sev = 2
            else:
                sputum_sev = 1

            # 4. Breathlessness Score (Unvoiced Speech Pause Ratio + Gasp Intensity)
            speech_ratio = np.mean(self.history_speech_flags)
            pause_ratio = 1.0 - speech_ratio
            avg_gasp = np.mean(self.history_gasp_scores)
            breathlessness = int(np.clip((pause_ratio * 3.5) + (avg_gasp * 2.5), 0, 5))

            # 5. Stridor Detection Index
            stridor_idx = float(np.clip(np.mean(self.history_stridor_indices) * 2.5, 0.0, 1.0))

            # 6. Snoring Nocturnal Score
            snore_score = float(np.mean(self.history_snore_scores))

            # 7 & 8. Jitter and Shimmer Means
            mean_jitter = float(np.mean(self.history_jitter))
            mean_shimmer = float(np.mean(self.history_shimmer))

            # 9. Ambient Noise Level
            mean_ambient = float(np.mean(self.history_ambient_db))

            # 10 & 11. Speech Rate and Respiratory Rate Estimates
            speech_rate_wpm = float(np.clip(140.0 - (breathlessness * 12.0), 50.0, 180.0))
            respiratory_rate = float(np.clip(16.0 + (breathlessness * 3.0), 10.0, 38.0))

            return {
                "hourly_cough_count": total_coughs,
                "wheeze_percent_duration": round(wheeze_pct, 2),
                "sputum_severity": int(sputum_sev),
                "breathlessness_score": int(breathlessness),
                "stridor_detection_index": round(stridor_idx, 3),
                "snoring_nocturnal_score": round(snore_score, 2),
                "vocal_hoarseness_jitter": round(mean_jitter, 3),
                "vocal_shimmer_score": round(mean_shimmer, 3),
                "ambient_noise_decibels": round(mean_ambient, 1),
                "speech_rate_wpm": round(speech_rate_wpm, 1),
                "respiratory_rate_brpm": round(respiratory_rate, 1)
            }


# ==========================================
# LIVE TEST RUN
# ==========================================
if __name__ == "__main__":
    import json

    pipeline = LiveAudioFeaturePipeline()
    pipeline.start_recording()

    try:
        print("\n--- Live Audio Stream Recording Active ---")
        print("Speak, cough, or make sound into your microphone.")
        print("Printing updated rolling hourly telemetry features every 5 seconds...\n")

        for i in range(4): # Run test loop for 20 seconds
            time.sleep(5)
            telemetry = pipeline.get_latest_hourly_telemetry()
            print(f"--- [Snapshot at t={ (i+1)*5 }s] Rolling Hourly Audio Telemetry ---")
            print(json.dumps(telemetry, indent=2))
            print("-" * 55)

    except KeyboardInterrupt:
        pass
    finally:
        pipeline.stop_recording()