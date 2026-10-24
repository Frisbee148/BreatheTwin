'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MicFeatures, extractMicFeatures } from '@/lib/api';

interface MicFeaturesDashboardProps {
  patientId: string;
  onFeaturesUpdate?: (features: MicFeatures) => void;
}

const DEFAULT_MIC: MicFeatures = {
  stridor_detection_index: 0.0,
  snoring_nocturnal_score: 0.0,
  vocal_hoarseness_jitter: 0.5,
  speech_rate_wpm: 140.0,
};

function encodePcmSamples(samples: Float32Array): string {
  const pcmSamples = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    pcmSamples[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  const bytes = new Uint8Array(pcmSamples.buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export default function MicFeaturesDashboard({ patientId, onFeaturesUpdate }: MicFeaturesDashboardProps) {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [features, setFeatures] = useState<MicFeatures>(DEFAULT_MIC);
  const [quality, setQuality] = useState<number>(0.0);
  const [isSilent, setIsSilent] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [savedSessions, setSavedSessions] = useState<number>(0);
  const [peakAudioLevel, setPeakAudioLevel] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentOutputRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const sampleChunksRef = useRef<Float32Array[]>([]);
  const bufferedSampleCountRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const peakAudioLevelRef = useRef(0);

  // Draw audio oscilloscope waveform
  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current || !isActive) return;

    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    ctx.fillStyle = '#020A05';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#3DE07A';
    ctx.beginPath();

    const sliceWidth = (canvas.width * 1.0) / bufferLength;
    let x = 0;
    let maxAmp = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.height) / 2;

      const deviation = Math.abs(dataArray[i] - 128);
      if (deviation > maxAmp) maxAmp = deviation;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    peakAudioLevelRef.current = Math.min(100, Math.round((maxAmp / 128) * 100));

  }, [isActive]);

  const processAudioChunk = useCallback(async (samples: Float32Array, sampleRate: number) => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    try {
      const res = await extractMicFeatures(patientId, encodePcmSamples(samples), sampleRate);
      setErrorMessage(res.error ?? null);
      if (res && res.features) {
        setFeatures(res.features);
        setQuality(res.quality);
        setIsSilent(res.is_silent);
        setLastUpdated(new Date().toLocaleTimeString());
        onFeaturesUpdate?.(res.features);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Audio telemetry extraction failed.');
    } finally {
      requestInFlightRef.current = false;
    }
  }, [onFeaturesUpdate, patientId]);

  // Start audio stream
  const startStream = async () => {
    setErrorMessage(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Microphone access is unavailable in this browser or origin.');
      return;
    }
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const context = new AudioContext();
      audioCtx = context;
      await context.resume();
      audioContextRef.current = context;

      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;

      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);

      const processor = context.createScriptProcessor(4096, 1, 1);
      const silentOutput = context.createGain();
      silentOutput.gain.value = 0;
      source.connect(processor);
      processor.connect(silentOutput);
      silentOutput.connect(audioCtx.destination);
      processorRef.current = processor;
      silentOutputRef.current = silentOutput;
      sampleChunksRef.current = [];
      bufferedSampleCountRef.current = 0;

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        sampleChunksRef.current.push(new Float32Array(input));
        bufferedSampleCountRef.current += input.length;
        if (bufferedSampleCountRef.current < context.sampleRate) return;

        if (requestInFlightRef.current) {
          sampleChunksRef.current = [];
          bufferedSampleCountRef.current = 0;
          return;
        }

        const chunk = new Float32Array(bufferedSampleCountRef.current);
        let offset = 0;
        for (const part of sampleChunksRef.current) {
          chunk.set(part, offset);
          offset += part.length;
        }
        sampleChunksRef.current = [];
        bufferedSampleCountRef.current = 0;
        void processAudioChunk(chunk, context.sampleRate);
      };

      setLastUpdated(null);
      setIsActive(true);
    } catch (err: unknown) {
      stream?.getTracks().forEach(track => track.stop());
      if (audioCtx && audioCtx.state !== 'closed') void audioCtx.close();
      streamRef.current = null;
      audioContextRef.current = null;
      console.error('Microphone access error:', err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Microphone access denied or disconnected.',
      );
    }
  };

  // Stop audio stream
  const stopStream = () => {
    setIsActive(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    silentOutputRef.current?.disconnect();
    silentOutputRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    sampleChunksRef.current = [];
    bufferedSampleCountRef.current = 0;
    requestInFlightRef.current = false;
    peakAudioLevelRef.current = 0;
    setPeakAudioLevel(0);
  };

  useEffect(() => {
    if (isActive) {
      const drawFrame = () => {
        drawWaveform();
        animationFrameRef.current = requestAnimationFrame(drawFrame);
      };
      animationFrameRef.current = requestAnimationFrame(drawFrame);
      timerRef.current = setInterval(() => setPeakAudioLevel(peakAudioLevelRef.current), 100);
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, drawWaveform]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleSaveSession = () => {
    setSavedSessions(prev => prev + 1);
  };

  const handleDiscardSession = () => {
    setFeatures(DEFAULT_MIC);
    setQuality(0.0);
    setIsSilent(true);
  };

  const isStridorAlert = features.stridor_detection_index > 0.35;

  return (
    <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-4 text-xs font-mono space-y-4 shadow-sm dark:shadow-none transition-colors">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#B4E3C5]/60 dark:border-[#12612F]/40 pb-2.5">
        <div className="flex items-center space-x-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-[#0E793C] dark:bg-[#4CFF8A] animate-pulse' : 'bg-gray-400'}`} />
          <span className="font-bold text-[#0E2E1B] dark:text-[#B6FFCC] text-xs uppercase tracking-wider">
            ◈ Real-Time Voice Biomarkers (Acoustic 4-Channel)
          </span>
          <span className="text-[10px] px-2 py-0.5 border border-[#B4E3C5] dark:border-[#12612F] text-[#0A602F] dark:text-[#2FBF63] bg-[#EAF8EF] dark:bg-[#061C0E]">
            {isActive
              ? errorMessage
                ? 'API UNAVAILABLE'
                : lastUpdated
                  ? isSilent
                    ? 'SILENCE DETECTED'
                    : 'VOICE CAPTURED'
                  : 'WAITING FOR AUDIO'
              : 'MIC IDLE (NO LIVE DATA)'}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {!isActive ? (
            <button
              type="button"
              onClick={startStream}
              className="px-3 py-1 font-bold uppercase text-[11px] border border-[#0E793C] dark:border-[#4CFF8A] bg-[#0E793C] dark:bg-[#4CFF8A]/15 text-white dark:text-[#4CFF8A] hover:bg-[#0A602F] dark:hover:bg-[#4CFF8A] dark:hover:text-[#020A05] transition-all cursor-pointer"
            >
              ▶ START MIC
            </button>
          ) : (
            <button
              type="button"
              onClick={stopStream}
              className="px-3 py-1 font-bold uppercase text-[11px] border border-[#DC2626] dark:border-[#FF2A1A] bg-[#DC2626] dark:bg-[#FF2A1A]/15 text-white dark:text-[#FF2A1A] hover:bg-[#B91C1C] transition-all cursor-pointer"
            >
              ❚❚ STOP MIC
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveSession}
            title="Save current audio telemetry window"
            className="px-2.5 py-1 text-[11px] border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] text-[#0E793C] dark:text-[#2FBF63] hover:border-[#0E793C] cursor-pointer"
          >
            💾 SAVE {savedSessions > 0 ? `(${savedSessions})` : ''}
          </button>
          <button
            type="button"
            onClick={handleDiscardSession}
            title="Reset to default heuristic values"
            className="px-2.5 py-1 text-[11px] border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] text-[#4A755A] dark:text-[#2FBF63] hover:text-[#DC2626] cursor-pointer"
          >
            ↺ RESET
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-2 border border-[#DC2626]/40 bg-[#FEF2F2] dark:bg-[#1A0606] text-[#DC2626] dark:text-[#FF2A1A] text-[11px] flex items-center justify-between">
          <span>⚠️ {errorMessage}</span>
          <span className="text-[10px] underline cursor-pointer" onClick={() => setErrorMessage(null)}>Dismiss</span>
        </div>
      )}

      {/* Main Grid: Waveform Oscilloscope + 4 Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Left Column: Waveform Oscilloscope Canvas */}
        <div className="md:col-span-4 flex flex-col space-y-2">
          <div className="relative h-28 bg-[#020A05] border border-[#B4E3C5] dark:border-[#12612F] overflow-hidden flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={320}
              height={112}
              className="w-full h-full object-contain"
            />
            {!isActive && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-gray-400 space-y-1">
                <span className="text-xl">🎙️</span>
                <span className="text-[10px]">Microphone stream inactive</span>
              </div>
            )}
            {/* Visual audio VU indicator */}
            {isActive && (
              <div className="absolute bottom-1 right-2 text-[9px] text-[#3DE07A] bg-black/70 px-1 border border-[#12612F]">
                VU: {peakAudioLevel}%
              </div>
            )}
          </div>

          <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63] flex justify-between">
            <span>LAST SYNC: {lastUpdated || 'No live sample yet'}</span>
            <span>QUALITY: {Math.round(quality * 100)}%</span>
          </div>
        </div>

        {/* Right Column: 4 Real-Time Acoustic Feature Cards */}
        <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* 1. Stridor Detection Index */}
          <div className={`border p-2.5 transition-colors ${
            isStridorAlert 
              ? 'border-[#DC2626] bg-[#FEF2F2] dark:bg-[#200A0A]' 
              : 'border-[#B4E3C5]/60 dark:border-[#12612F]/40 bg-[#F6FBF7] dark:bg-[#061C0E]'
          }`}>
            <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] uppercase">Stridor Index</div>
            <div className={`text-base font-bold ${isStridorAlert ? 'text-[#DC2626] dark:text-[#FF2A1A]' : 'text-[#0E793C] dark:text-[#4CFF8A]'}`}>
              {features.stridor_detection_index.toFixed(3)}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1.5 mt-1.5">
              <div
                className={`h-full ${isStridorAlert ? 'bg-[#DC2626]' : 'bg-[#0E793C] dark:bg-[#4CFF8A]'}`}
                style={{ width: `${Math.min(100, features.stridor_detection_index * 150)}%` }}
              />
            </div>
            <span className="text-[9px] text-gray-500 mt-1 block">
              {isStridorAlert ? '⚠️ Wheeze Detected' : 'Airway Clear (400-2k Hz)'}
            </span>
          </div>

          {/* 2. Snoring Nocturnal Score */}
          <div className="border border-[#B4E3C5]/60 dark:border-[#12612F]/40 p-2.5 bg-[#F6FBF7] dark:bg-[#061C0E]">
            <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] uppercase">Snoring Score</div>
            <div className="text-base font-bold text-[#0E793C] dark:text-[#4CFF8A]">
              {features.snoring_nocturnal_score.toFixed(2)}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1.5 mt-1.5">
              <div className="h-full bg-[#0E793C] dark:bg-[#4CFF8A]" style={{ width: `${Math.min(100, features.snoring_nocturnal_score * 120)}%` }} />
            </div>
            <span className="text-[9px] text-gray-500 mt-1 block">Low-freq 50-500 Hz</span>
          </div>

          {/* 3. Vocal Hoarseness Jitter */}
          <div className="border border-[#B4E3C5]/60 dark:border-[#12612F]/40 p-2.5 bg-[#F6FBF7] dark:bg-[#061C0E]">
            <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] uppercase">Vocal Jitter</div>
            <div className="text-base font-bold text-[#0E793C] dark:text-[#4CFF8A]">
              {features.vocal_hoarseness_jitter.toFixed(2)}%
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1.5 mt-1.5">
              <div className="h-full bg-[#0E793C] dark:bg-[#4CFF8A]" style={{ width: `${Math.min(100, features.vocal_hoarseness_jitter * 35)}%` }} />
            </div>
            <span className="text-[9px] text-gray-500 mt-1 block">Pitch perturbation</span>
          </div>

          {/* 4. Speech Rate WPM */}
          <div className="border border-[#B4E3C5]/60 dark:border-[#12612F]/40 p-2.5 bg-[#F6FBF7] dark:bg-[#061C0E]">
            <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] uppercase">Speech Rate</div>
            <div className="text-base font-bold text-[#0E793C] dark:text-[#4CFF8A]">
              {features.speech_rate_wpm} <span className="text-[9px] text-gray-400">wpm</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1.5 mt-1.5">
              <div className="h-full bg-[#0E793C] dark:bg-[#4CFF8A]" style={{ width: `${Math.min(100, (features.speech_rate_wpm / 180) * 100)}%` }} />
            </div>
            <span className="text-[9px] text-gray-500 mt-1 block">Normal: 120-160</span>
          </div>
        </div>
      </div>
    </div>
  );
}
