'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './LiveAudioVisualizerViewer.module.css';
import type { VoiceFeatures } from './LiveVoiceFeatureIndicators';

interface AudioExtractionResult {
  features: VoiceFeatures;
  quality: number;
  is_silent: boolean;
  timestamp: string;
}

interface LiveAudioVisualizerViewerProps {
  patientId: string;
  isRecording?: boolean;
  onFeaturesUpdate?: (features: VoiceFeatures) => void;
  onResult?: (result: AudioExtractionResult) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

function samplesToBase64(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export default function LiveAudioVisualizerViewer({
  patientId,
  isRecording = true,
  onFeaturesUpdate,
  onResult,
}: LiveAudioVisualizerViewerProps) {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState(0);
  const [isSilent, setIsSilent] = useState(true);
  const [peakLevel, setPeakLevel] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sampleBufferRef = useRef<Float32Array[]>([]);
  const bufferedSamplesRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const isRecordingRef = useRef(isRecording);
  const peakLevelRef = useRef(0);

  const stopMicrophone = useCallback(() => {
    if (processorRef.current) processorRef.current.onaudioprocess = null;
    processorRef.current?.disconnect();
    analyserRef.current?.disconnect();
    gainRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    processorRef.current = null;
    gainRef.current = null;
    sampleBufferRef.current = [];
    bufferedSamplesRef.current = 0;
    setPeakLevel(0);
    setIsActive(false);
  }, []);

  const startMicrophone = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access is unavailable in this browser or origin.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const audioContext = new AudioContext();
      await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const silentOutput = audioContext.createGain();
      silentOutput.gain.value = 0;
      source.connect(analyser);
      source.connect(processor);
      processor.connect(silentOutput);
      silentOutput.connect(audioContext.destination);

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      processorRef.current = processor;
      gainRef.current = silentOutput;
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        sampleBufferRef.current.push(new Float32Array(input));
        bufferedSamplesRef.current += input.length;
        if (bufferedSamplesRef.current >= audioContext.sampleRate && !requestInFlightRef.current) {
          const samples = new Float32Array(bufferedSamplesRef.current);
          let offset = 0;
          for (const chunk of sampleBufferRef.current) {
            samples.set(chunk, offset);
            offset += chunk.length;
          }
          sampleBufferRef.current = [];
          bufferedSamplesRef.current = 0;
          requestInFlightRef.current = true;
          const audioBase64 = samplesToBase64(samples);

          void fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}/mic-features`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pcm_base64: audioBase64, sample_rate: audioContext.sampleRate }),
            cache: 'no-store',
          })
            .then(async (response) => {
              if (!response.ok) throw new Error(`Voice extraction failed (${response.status}).`);
              return await response.json() as AudioExtractionResult;
            })
            .then((nextResult) => {
              setQuality(nextResult.quality);
              setIsSilent(nextResult.is_silent);
              setLastUpdated(new Date(nextResult.timestamp).toLocaleTimeString());
              setError(null);
              onFeaturesUpdate?.(nextResult.features);
              onResult?.(nextResult);
            })
            .catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : 'Voice extraction request failed.');
            })
            .finally(() => {
              requestInFlightRef.current = false;
            });
        }
      };
      setIsActive(true);
    } catch (cause: unknown) {
      stopMicrophone();
      setError(cause instanceof Error ? cause.message : 'Microphone access was denied.');
    }
  }, [onFeaturesUpdate, onResult, patientId, stopMicrophone]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close();
    }
  }, []);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    if (!isActive || !isRecording) return;
    let frameId = 0;
    const levelInterval = window.setInterval(() => setPeakLevel(peakLevelRef.current), 100);
    const draw = () => {
      const canvas = canvasRef.current;
      const analyser = analyserRef.current;
      const context = canvas?.getContext('2d');
      if (canvas && analyser && context) {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = peakLevelRef.current > 55 ? '#ff6876' : '#42e889';
        context.lineWidth = 2;
        context.beginPath();
        let peak = 0;
        for (let index = 0; index < data.length; index += 1) {
          const x = (index / (data.length - 1)) * canvas.width;
          const y = ((data[index] - 128) / 128) * canvas.height * 0.45 + canvas.height / 2;
          peak = Math.max(peak, Math.abs(data[index] - 128));
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
        peakLevelRef.current = Math.min(100, Math.round((peak / 128) * 100));
      }
      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frameId);
      window.clearInterval(levelInterval);
    };
  }, [isActive, isRecording]);

  return (
    <section className={styles.card} aria-label="Live audio visualizer">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Live voice capture</h2>
          <p className={styles.subtitle}>One-second PCM chunks are sent to the voice feature endpoint.</p>
        </div>
        <span className={`${styles.status} ${isActive ? styles.active : styles.idle}`}>
          <span className={styles.statusDot} />
          {isActive ? (isSilent ? 'LISTENING / SILENT' : 'AUDIO DETECTED') : 'MICROPHONE OFF'}
        </span>
      </header>

      {error && <p className={styles.error} role="status">{error}</p>}

      <div className={styles.waveform}>
        <canvas ref={canvasRef} width={640} height={180} className={styles.canvas} aria-label="Live audio waveform" />
        {!isActive && <span className={styles.placeholder}>Start the microphone to view its waveform.</span>}
      </div>
      <div className={styles.controls}>
        {!isActive ? (
          <button type="button" className={styles.primaryButton} onClick={() => void startMicrophone()}>
            Start microphone
          </button>
        ) : (
          <button type="button" className={styles.stopButton} onClick={stopMicrophone}>
            Stop microphone
          </button>
        )}
        <span className={styles.metric}>Input level {peakLevel}%</span>
        <span className={styles.metric}>Quality {Math.round(quality * 100)}%</span>
        <span className={styles.metric}>{lastUpdated ?? 'No audio processed yet'}</span>
      </div>
    </section>
  );
}
