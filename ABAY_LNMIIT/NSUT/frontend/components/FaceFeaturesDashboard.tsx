'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaceFeatures, FaceLandmark, extractFaceFeatures } from '@/lib/api';

interface FaceFeaturesDashboardProps {
  patientId: string;
  onFeaturesUpdate?: (features: FaceFeatures) => void;
}

const DEFAULT_FACE: FaceFeatures = {
  mouth_breathing_ratio: 0.10,
  nasal_flaring_index: 0.15,
  brow_strain_score: 0.08,
  head_bobbing_amplitude: 0.03,
  video_respiratory_rate: 16.0,
  yawn_sigh_count: 0,
  blink_rate_bpm: 16.0,
  forehead_rppg_heart_rate: 72.0,
  jaw_slack_index: 0.10,
  gaze_instability_score: 0.05,
};

export default function FaceFeaturesDashboard({ patientId, onFeaturesUpdate }: FaceFeaturesDashboardProps) {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [features, setFeatures] = useState<FaceFeatures>(DEFAULT_FACE);
  const [quality, setQuality] = useState<number>(0.0);
  const [faceDetected, setFaceDetected] = useState<boolean>(false);
  const [landmarks, setLandmarks] = useState<FaceLandmark[]>([]);
  const [backendUnavailable, setBackendUnavailable] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [savedSessions, setSavedSessions] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarksCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Capture frame from video element and send to backend
  const captureAndExtract = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !isActive) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const targetAspect = canvas.width / canvas.height;
    const videoAspect = video.videoWidth / video.videoHeight;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;
    if (videoAspect > targetAspect) {
      sourceWidth = video.videoHeight * targetAspect;
      sourceX = (video.videoWidth - sourceWidth) / 2;
    } else if (videoAspect < targetAspect) {
      sourceHeight = video.videoWidth / targetAspect;
      sourceY = (video.videoHeight - sourceHeight) / 2;
    }
    ctx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.65);

    try {
      const res = await extractFaceFeatures(patientId, dataUrl);
      if (res && res.features) {
        setFeatures(res.features);
        setQuality(res.quality);
        setFaceDetected(res.face_detected);
        setLandmarks(res.face_detected ? res.landmarks ?? [] : []);
        setBackendUnavailable(Boolean(res.error));
        setErrorMessage(
          res.error ?? (res.face_detected ? null : 'No face detected. Improve lighting and center your face.'),
        );
        setLastUpdated(new Date().toLocaleTimeString());
        if (onFeaturesUpdate) {
          onFeaturesUpdate(res.features);
        }
      }
    } catch (err: unknown) {
      setBackendUnavailable(true);
      setErrorMessage(err instanceof Error ? err.message : 'Frame processing failed.');
    }
  }, [isActive, patientId, onFeaturesUpdate]);

  useEffect(() => {
    const canvas = landmarksCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!isActive || !faceDetected) return;

    context.fillStyle = '#3DE07A';
    for (const landmark of landmarks) {
      const x = landmark.x * canvas.width;
      const y = landmark.y * canvas.height;
      context.beginPath();
      context.arc(x, y, 1.35, 0, Math.PI * 2);
      context.fill();
    }
  }, [faceDetected, isActive, landmarks]);

  // Start video stream
  const startStream = async () => {
    setErrorMessage(null);
    setBackendUnavailable(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsActive(true);
    } catch (err: unknown) {
      console.error('Camera permission/access error:', err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Camera access denied or device disconnected. Using heuristic fallback values.',
      );
    }
  };

  // Stop video stream
  const stopStream = () => {
    setIsActive(false);
    setFaceDetected(false);
    setLandmarks([]);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Periodic capture loop
  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        captureAndExtract();
      }, 1200);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, captureAndExtract]);

  // Clean up stream on unmount
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
    setFeatures(DEFAULT_FACE);
    setQuality(0.0);
    setFaceDetected(false);
    setLandmarks([]);
  };

  return (
    <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-4 text-xs font-mono space-y-4 shadow-sm dark:shadow-none transition-colors">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#B4E3C5]/60 dark:border-[#12612F]/40 pb-2.5">
        <div className="flex items-center space-x-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-[#0E793C] dark:bg-[#4CFF8A] animate-pulse' : 'bg-gray-400'}`} />
          <span className="font-bold text-[#0E2E1B] dark:text-[#B6FFCC] text-xs uppercase tracking-wider">
            ◈ Real-Time Face Biomarkers (Computer Vision 10-Channel)
          </span>
          <span className="text-[10px] px-2 py-0.5 border border-[#B4E3C5] dark:border-[#12612F] text-[#0A602F] dark:text-[#2FBF63] bg-[#EAF8EF] dark:bg-[#061C0E]">
          {isActive ? (faceDetected ? `TRACKING ${landmarks.length} KEYPOINTS` : 'SCANNING FOR FACE') : 'CAMERA IDLE (NO LIVE DATA)'}
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
              ▶ START CAMERA
            </button>
          ) : (
            <button
              type="button"
              onClick={stopStream}
              className="px-3 py-1 font-bold uppercase text-[11px] border border-[#DC2626] dark:border-[#FF2A1A] bg-[#DC2626] dark:bg-[#FF2A1A]/15 text-white dark:text-[#FF2A1A] hover:bg-[#B91C1C] transition-all cursor-pointer"
            >
              ❚❚ STOP CAMERA
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveSession}
            title="Save current telemetry capture window"
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

      {/* Main Grid: Video Stream Tile + 10 Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Left Column: Live Video Tile */}
        <div className="md:col-span-4 flex flex-col space-y-2">
          <div className="relative aspect-[4/3] bg-black border border-[#B4E3C5] dark:border-[#12612F] overflow-hidden flex items-center justify-center">
            <video
              ref={videoRef}
              className={`w-full h-full object-cover ${isActive ? 'block' : 'hidden'}`}
              playsInline
              muted
            />
            <canvas
              ref={landmarksCanvasRef}
              width={320}
              height={240}
              aria-label="Live facial landmark overlay"
              className={`absolute inset-0 h-full w-full pointer-events-none ${isActive && faceDetected ? 'block' : 'hidden'}`}
            />
            {!isActive && (
              <div className="text-center p-4 text-gray-400 space-y-2">
                <div className="text-2xl">📹</div>
                <div className="text-[11px]">Camera stream stopped. Live values are paused.</div>
              </div>
            )}
            {isActive && !faceDetected && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-[#FFE14A] text-[10px] tracking-wide font-bold">
                {backendUnavailable ? 'FACE API UNAVAILABLE' : 'ALIGN FACE IN CENTER'}
              </div>
            )}
            {/* Visual HUD overlay */}
            {isActive && faceDetected && (
              <div className="absolute top-2 left-2 text-[9px] bg-black/60 px-1.5 py-0.5 text-[#3DE07A] border border-[#12612F]">
                {landmarks.length} KEYPOINTS | QUALITY: {(quality * 100).toFixed(0)}%
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63] flex justify-between">
            <span>LAST SYNC: {lastUpdated || 'Initial Baseline'}</span>
            <span>SOURCE: {faceDetected ? 'Live Mesh' : backendUnavailable ? 'API UNAVAILABLE' : 'No live mesh'}</span>
          </div>
        </div>

        {/* Right Column: 10 Real-Time Feature Gauges */}
        <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* 1. Mouth Breathing Ratio */}
          <div className="border border-[#B4E3C5]/60 dark:border-[#12612F]/40 p-2 bg-[#F6FBF7] dark:bg-[#061C0E]">
            <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] uppercase">Mouth Breathing (MAR)</div>
            <div className="text-base font-bold text-[#0E793C] dark:text-[#4CFF8A]">
              {(features.mouth_breathing_ratio * 100).toFixed(0)}%
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 mt-1">
              <div
                className={`h-full ${features.mouth_breathing_ratio > 0.4 ? 'bg-[#DC2626]' : 'bg-[#0E793C] dark:bg-[#4CFF8A]'}`}
                style={{ width: `${Math.min(100, features.mouth_breathing_ratio * 100)}%` }}
              />
            </div>
            <span className="text-[9px] text-gray-500">{features.mouth_breathing_ratio > 0.4 ? 'Oral Breathing' : 'Nasal'}</span>
          </div>

          {/* 2. Nasal Flaring Index */}
          <div className="border border-[#B4E3C5]/60 dark:border-[#12612F]/40 p-2 bg-[#F6FBF7] dark:bg-[#061C0E]">
            <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] uppercase">Nasal Flaring</div>
            <div className="text-base font-bold text-[#0E793C] dark:text-[#4CFF8A]">
              {features.nasal_flaring_index.toFixed(2)}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 mt-1">
              <div className="h-full bg-[#0E793C] dark:bg-[#4CFF8A]" style={{ width: `${Math.min(100, features.nasal_flaring_index * 120)}%` }} />
            </div>
            <span className="text-[9px] text-gray-500">&gt;0.40 = Distress</span>
          </div>

          {/* 3. Brow Strain Score */}
          <div className="border border-[#B4E3C5]/60 dark:border-[#12612F]/40 p-2 bg-[#F6FBF7] dark:bg-[#061C0E]">
            <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] uppercase">Brow Strain</div>
            <div className="text-base font-bold text-[#0E793C] dark:text-[#4CFF8A]">
              {features.brow_strain_score.toFixed(2)}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 mt-1">
              <div className="h-full bg-[#0E793C] dark:bg-[#4CFF8A]" style={{ width: `${Math.min(100, features.brow_strain_score * 100)}%` }} />
            </div>
            <span className="text-[9px] text-gray-500">Corrugator frown</span>
          </div>

          {/* 4. Head Bobbing */}
          <div className="border border-[#B4E3C5]/60 dark:border-[#12612F]/40 p-2 bg-[#F6FBF7] dark:bg-[#061C0E]">
            <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] uppercase">Head Bobbing</div>
            <div className="text-base font-bold text-[#0E793C] dark:text-[#4CFF8A]">
              {features.head_bobbing_amplitude.toFixed(2)}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 mt-1">
              <div className="h-full bg-[#0E793C] dark:bg-[#4CFF8A]" style={{ width: `${Math.min(100, features.head_bobbing_amplitude * 200)}%` }} />
            </div>
            <span className="text-[9px] text-gray-500">Accessory muscle</span>
          </div>

          {/* 5. Video RR */}
          <div className="border border-[#B4E3C5]/60 dark:border-[#12612F]/40 p-2 bg-[#F6FBF7] dark:bg-[#061C0E]">
            <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] uppercase">Video Resp Rate</div>
            <div className="text-base font-bold text-[#0E793C] dark:text-[#4CFF8A]">
              {features.video_respiratory_rate} <span className="text-[9px] text-gray-400">brpm</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 mt-1">
              <div className="h-full bg-[#0E793C] dark:bg-[#4CFF8A]" style={{ width: `${Math.min(100, (features.video_respiratory_rate / 35) * 100)}%` }} />
            </div>
            <span className="text-[9px] text-gray-500">Normal: 12-20</span>
          </div>

          {/* 6. Yawn / Sigh Count */}
          <div className="border border-[#B4E3C5]/60 dark:border-[#12612F]/40 p-2 bg-[#F6FBF7] dark:bg-[#061C0E]">
            <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] uppercase">Yawn/Sigh Count</div>
            <div className="text-base font-bold text-[#0E793C] dark:text-[#4CFF8A]">
              {features.yawn_sigh_count} <span className="text-[9px] text-gray-400">evts</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 mt-1">
              <div className="h-full bg-[#0E793C] dark:bg-[#4CFF8A]" style={{ width: `${Math.min(100, features.yawn_sigh_count * 15)}%` }} />
            </div>
            <span className="text-[9px] text-gray-500">Air hunger sighs</span>
          </div>

          {/* 7. Blink Rate BPM */}
          <div className="border border-[#B4E3C5]/60 dark:border-[#12612F]/40 p-2 bg-[#F6FBF7] dark:bg-[#061C0E]">
            <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] uppercase">Blink Rate</div>
            <div className="text-base font-bold text-[#0E793C] dark:text-[#4CFF8A]">
              {features.blink_rate_bpm} <span className="text-[9px] text-gray-400">/min</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 mt-1">
              <div className="h-full bg-[#0E793C] dark:bg-[#4CFF8A]" style={{ width: `${Math.min(100, (features.blink_rate_bpm / 30) * 100)}%` }} />
            </div>
            <span className="text-[9px] text-gray-500">Normal: 12-20</span>
          </div>

          {/* 8. rPPG Heart Rate */}
          <div className="border border-[#B4E3C5]/60 dark:border-[#12612F]/40 p-2 bg-[#F6FBF7] dark:bg-[#061C0E]">
            <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] uppercase">Forehead rPPG HR</div>
            <div className="text-base font-bold text-[#0E793C] dark:text-[#4CFF8A]">
              {features.forehead_rppg_heart_rate} <span className="text-[9px] text-gray-400">bpm</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 mt-1">
              <div className="h-full bg-[#0E793C] dark:bg-[#4CFF8A]" style={{ width: `${Math.min(100, (features.forehead_rppg_heart_rate / 140) * 100)}%` }} />
            </div>
            <span className="text-[9px] text-gray-500">Optical pulse</span>
          </div>

          {/* 9. Jaw Slack Index */}
          <div className="border border-[#B4E3C5]/60 dark:border-[#12612F]/40 p-2 bg-[#F6FBF7] dark:bg-[#061C0E]">
            <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] uppercase">Jaw Slack Index</div>
            <div className="text-base font-bold text-[#0E793C] dark:text-[#4CFF8A]">
              {features.jaw_slack_index.toFixed(2)}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 mt-1">
              <div className="h-full bg-[#0E793C] dark:bg-[#4CFF8A]" style={{ width: `${Math.min(100, features.jaw_slack_index * 150)}%` }} />
            </div>
            <span className="text-[9px] text-gray-500">Muscle exhaustion</span>
          </div>

          {/* 10. Gaze Instability Score */}
          <div className="border border-[#B4E3C5]/60 dark:border-[#12612F]/40 p-2 bg-[#F6FBF7] dark:bg-[#061C0E]">
            <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] uppercase">Gaze Instability</div>
            <div className="text-base font-bold text-[#0E793C] dark:text-[#4CFF8A]">
              {features.gaze_instability_score.toFixed(2)}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 mt-1">
              <div className="h-full bg-[#0E793C] dark:bg-[#4CFF8A]" style={{ width: `${Math.min(100, features.gaze_instability_score * 200)}%` }} />
            </div>
            <span className="text-[9px] text-gray-500">Ocular restlessness</span>
          </div>
        </div>
      </div>
    </div>
  );
}
