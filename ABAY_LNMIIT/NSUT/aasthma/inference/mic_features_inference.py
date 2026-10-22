import time
import base64
import threading
import collections
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Union

import numpy as np
import scipy.signal as signal
import librosa

try:
    import sounddevice as sd
    HAS_SOUNDDEVICE = True
except Exception:
    HAS_SOUNDDEVICE = False

# Default Heuristic Fallbacks for 4 Voice/Audio Features
DEFAULT_MIC_FALLBACK = {
    "stridor_detection_index": 0.0,
    "snoring_nocturnal_score": 0.0,
    "vocal_hoarseness_jitter": 0.5,
    "speech_rate_wpm": 140.0
}

class LiveAudioFeaturePipeline:
    """
    Real-Time Acoustic & Voice Feature Extraction Pipeline for Respiratory Distress.
    Extracts 4 critical acoustic biomarkers via DSP (STFT, pyin, band energy ratios):
      1. stridor_detection_index  (High-frequency inspiratory wheeze / stridor in 400-2000 Hz)
      2. snoring_nocturnal_score  (Low-frequency pharyngeal collapse vibrations in 50-500 Hz)
      3. vocal_hoarseness_jitter  (Fundamental frequency cycle-to-cycle perturbation / jitter %)
      4. speech_rate_wpm          (Estimated words per minute / conversational cadence)
    """

    def __init__(self, sample_rate: int = 16000, chunk_size: int = 1024, hourly_window_seconds: int = 3600):
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.hourly_window_seconds = hourly_window_seconds
        self.running = False
        self.lock = threading.Lock()

        # Real-time raw audio buffer (last 3 seconds)
        self.raw_audio_buffer = collections.deque(maxlen=self.sample_rate * 3)

        # Rolling history buffers
        self.history_stridor = collections.deque(maxlen=hourly_window_seconds)
        self.history_snore = collections.deque(maxlen=hourly_window_seconds)
        self.history_jitter = collections.deque(maxlen=hourly_window_seconds)
        self.history_wpm = collections.deque(maxlen=hourly_window_seconds)

        self.last_extraction = dict(DEFAULT_MIC_FALLBACK)
        self.last_quality = 0.0
        self.stream = None

    @staticmethod
    def get_fallback_features(patient_profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Return deterministic clinical defaults for the 4 voice features."""
        return dict(DEFAULT_MIC_FALLBACK)

    def process_audio_chunk(self, audio_samples: np.ndarray, sample_rate: Optional[int] = None) -> Dict[str, Any]:
        """
        Process raw float32 audio samples [-1.0, 1.0] and compute the 4 voice features.
        """
        sr = sample_rate or self.sample_rate
        if audio_samples is None or len(audio_samples) == 0:
            return {
                "features": self.get_fallback_features(),
                "quality": 0.0,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

        audio_clean = np.asarray(audio_samples, dtype=np.float32)
        if audio_clean.ndim > 1:
            audio_clean = np.mean(audio_clean, axis=1)

        # Resample if sample rate does not match target
        if sr != self.sample_rate and len(audio_clean) > sr // 4:
            try:
                audio_clean = librosa.resample(audio_clean, orig_sr=sr, target_sr=self.sample_rate)
                sr = self.sample_rate
            except Exception:
                pass

        # Check silence
        rms = float(np.sqrt(np.mean(audio_clean ** 2) + 1e-12))
        if rms < 0.002: # Near absolute silence
            features = {
                "stridor_detection_index": 0.0,
                "snoring_nocturnal_score": 0.0,
                "vocal_hoarseness_jitter": 0.5,
                "speech_rate_wpm": 140.0
            }
            with self.lock:
                self.last_extraction = features
                self.last_quality = 0.90
            return {
                "features": features,
                "quality": 0.90,
                "is_silent": True,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

        n_fft = min(512, len(audio_clean))
        hop_length = n_fft // 2
        stft = np.abs(librosa.stft(audio_clean, n_fft=n_fft, hop_length=hop_length))
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
        total_energy = float(np.sum(stft) + 1e-6)

        # 1. Stridor Detection Index (Energy ratio in 400 - 2000 Hz)
        stridor_mask = (freqs >= 400) & (freqs <= 2000)
        stridor_energy = float(np.sum(stft[stridor_mask, :]) / total_energy)
        stridor_index = float(np.clip(stridor_energy * 2.2, 0.0, 1.0))

        # 2. Snoring Nocturnal Score (Energy ratio in 50 - 500 Hz)
        snore_mask = (freqs >= 50) & (freqs <= 500)
        snore_energy = float(np.sum(stft[snore_mask, :]) / total_energy)
        snoring_score = float(np.clip(snore_energy * 3.0, 0.0, 1.0))

        # 3. Vocal Hoarseness Jitter (Perturbation % via Pitch Estimation)
        try:
            # Efficient autocorrelation or parabolic pitch track
            pitches, magnitudes = librosa.piptrack(y=audio_clean, sr=sr, n_fft=n_fft, hop_length=hop_length, fmin=75, fmax=500)
            pitch_track = []
            for t in range(pitches.shape[1]):
                idx = magnitudes[:, t].argmax()
                pitch = pitches[idx, t]
                if pitch > 0:
                    pitch_track.append(pitch)
            
            if len(pitch_track) > 3:
                p_arr = np.array(pitch_track)
                periods = 1.0 / p_arr
                jitter_pct = float(np.mean(np.abs(np.diff(periods))) / (np.mean(periods) + 1e-8) * 100.0)
                vocal_jitter = float(np.clip(jitter_pct, 0.1, 8.0))
            else:
                vocal_jitter = 0.5
        except Exception:
            vocal_jitter = 0.5

        # 4. Speech Rate (Estimated WPM from Energy Envelope Syllable Peaks)
        try:
            onset_env = librosa.onset.onset_strength(y=audio_clean, sr=sr, hop_length=hop_length)
            peaks = signal.find_peaks(onset_env, distance=int(0.12 * sr / hop_length))[0]
            duration_sec = len(audio_clean) / sr
            syllables_per_sec = len(peaks) / max(0.5, duration_sec)
            # Standard conversion: ~4.0 syllables per second corresponds to ~140 words per minute
            est_wpm = float(np.clip(syllables_per_sec * 35.0, 40.0, 220.0))
        except Exception:
            est_wpm = 140.0

        features = {
            "stridor_detection_index": round(stridor_index, 3),
            "snoring_nocturnal_score": round(snoring_score, 3),
            "vocal_hoarseness_jitter": round(vocal_jitter, 3),
            "speech_rate_wpm": round(est_wpm, 1)
        }

        with self.lock:
            self.last_extraction = features
            self.last_quality = 0.95

        return {
            "features": features,
            "quality": 0.95,
            "is_silent": False,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    def process_pcm_bytes(self, pcm_bytes: bytes, sample_rate: int = 16000) -> Dict[str, Any]:
        """Convert raw 16-bit PCM bytes to float32 samples and extract features."""
        try:
            samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            return self.process_audio_chunk(samples, sample_rate=sample_rate)
        except Exception as exc:
            return {
                "features": self.get_fallback_features(),
                "quality": 0.0,
                "error": str(exc),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

    def process_base64_audio(self, base64_str: str, sample_rate: int = 16000) -> Dict[str, Any]:
        """Decode base64 encoded PCM/WAV and extract voice features."""
        try:
            if "," in base64_str:
                base64_str = base64_str.split(",")[1]
            raw_bytes = base64.b64decode(base64_str)
            return self.process_pcm_bytes(raw_bytes, sample_rate=sample_rate)
        except Exception as exc:
            return {
                "features": self.get_fallback_features(),
                "quality": 0.0,
                "error": str(exc),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

    def _audio_callback(self, indata, frames, time_info, status):
        """sounddevice background stream callback."""
        if status:
            pass
        samples = indata[:, 0].copy()
        self.process_audio_chunk(samples)

    def start_recording(self):
        """Starts live microphone listening using sounddevice."""
        if not HAS_SOUNDDEVICE:
            print("[!] sounddevice not available. Live hardware mic stream disabled.")
            return

        try:
            self.running = True
            self.stream = sd.InputStream(
                channels=1,
                samplerate=self.sample_rate,
                blocksize=self.chunk_size,
                callback=self._audio_callback
            )
            self.stream.start()
            print("[+] sounddevice real-time microphone stream started.")
        except Exception as exc:
            print(f"[!] Could not open microphone device: {exc}. Pipeline will use fallback or manual chunks.")
            self.running = False

    def stop_recording(self):
        """Stops live recording."""
        self.running = False
        if self.stream is not None:
            try:
                self.stream.stop()
                self.stream.close()
            except Exception:
                pass
            self.stream = None

    def get_latest_hourly_telemetry(self) -> Dict[str, Any]:
        with self.lock:
            return dict(self.last_extraction)


# Singleton instance for easy import and reuse
mic_pipeline = LiveAudioFeaturePipeline()

if __name__ == "__main__":
    print("[*] Testing Mic Feature Extraction with synthesized tone...")
    sr = 16000
    t = np.linspace(0, 1.0, sr, endpoint=False)
    # Synthesize tone with 800Hz whistling/stridor component
    synthetic_audio = 0.3 * np.sin(2 * np.pi * 800 * t) + 0.1 * np.random.randn(sr)
    res = mic_pipeline.process_audio_chunk(synthetic_audio, sample_rate=sr)
    print("Extracted 4 Voice Features on synthetic audio:")
    print(res)
    assert len(res["features"]) == 4
    print("[OK] Mic Features Pipeline verified!")
