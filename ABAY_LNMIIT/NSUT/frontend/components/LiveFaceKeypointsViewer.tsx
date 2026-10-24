'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './LiveFaceKeypointsViewer.module.css';
import type { FaceFeatures } from './LiveFaceFeatureGauges';

export interface FaceLandmark {
  x: number;
  y: number;
}

export interface FaceExtractionResult {
  features: FaceFeatures;
  landmarks: FaceLandmark[];
  quality: number;
  face_detected: boolean;
  timestamp: string;
}

interface LiveFaceKeypointsViewerProps {
  patientId: string;
  isRecording?: boolean;
  onFeaturesUpdate?: (features: FaceFeatures) => void;
  onResult?: (result: FaceExtractionResult) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

function getMeshColor(features: FaceFeatures | null): string {
  if (!features) return '#38d878';
  const severity = Math.max(
    features.mouth_breathing_ratio,
    features.nasal_flaring_index,
    features.brow_strain_score,
    features.head_bobbing_amplitude,
    features.jaw_slack_index,
    features.gaze_instability_score * 2,
  );
  if (severity >= 0.7) return '#ff5364';
  if (severity >= 0.3) return '#ffd34e';
  return '#38d878';
}

export default function LiveFaceKeypointsViewer({
  patientId,
  isRecording = true,
  onFeaturesUpdate,
  onResult,
}: LiveFaceKeypointsViewerProps) {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FaceExtractionResult | null>(null);
  const [cameraAvailable, setCameraAvailable] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraAvailable(false);
    setIsActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is unavailable in this browser or origin.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraAvailable(true);
      setIsActive(true);
    } catch (cause: unknown) {
      stopCamera();
      setError(cause instanceof Error ? cause.message : 'Camera access was denied.');
    }
  }, [stopCamera]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!isActive || !result?.face_detected) return;

    context.fillStyle = getMeshColor(result.features);
    for (const landmark of result.landmarks) {
      context.beginPath();
      context.arc(landmark.x * canvas.width, landmark.y * canvas.height, 1.25, 0, Math.PI * 2);
      context.fill();
    }
  }, [isActive, result]);

  useEffect(() => {
    if (!isActive || !isRecording) return;
    let cancelled = false;
    const controller = new AbortController();

    const captureLoop = async () => {
      while (!cancelled) {
        const video = videoRef.current;
        const canvas = captureCanvasRef.current;
        const context = canvas?.getContext('2d');
        if (video && canvas && context && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageBase64 = canvas.toDataURL('image/jpeg', 0.65);
          try {
            const response = await fetch(
              `${API_BASE}/patients/${encodeURIComponent(patientId)}/face-features`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_base64: imageBase64 }),
                cache: 'no-store',
                signal: controller.signal,
              },
            );
            if (!response.ok) throw new Error(`Face extraction failed (${response.status}).`);
            const nextResult = await response.json() as FaceExtractionResult;
            if (!cancelled) {
              setResult(nextResult);
              setError(null);
              onFeaturesUpdate?.(nextResult.features);
              onResult?.(nextResult);
            }
          } catch (cause: unknown) {
            if (!cancelled && !(cause instanceof DOMException && cause.name === 'AbortError')) {
              setError(cause instanceof Error ? cause.message : 'Face extraction request failed.');
            }
          }
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
      }
    };

    void captureLoop();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isActive, isRecording, onFeaturesUpdate, onResult, patientId]);

  const detected = Boolean(result?.face_detected);

  return (
    <section className={styles.card} aria-label="Live face keypoints viewer">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Live face keypoints</h2>
          <p className={styles.subtitle}>Camera frames are processed locally by the configured feature API.</p>
        </div>
        <span className={`${styles.status} ${detected ? styles.statusGood : styles.statusIdle}`}>
          <span className={styles.statusDot} />
          {isActive ? (detected ? 'FACE DETECTED' : 'SEARCHING') : 'CAMERA OFF'}
        </span>
      </header>

      {error && <p className={styles.error} role="status">{error}</p>}

      <div className={styles.preview}>
        <video ref={videoRef} className={styles.video} playsInline muted aria-label="Live webcam preview" />
        <canvas ref={overlayCanvasRef} className={styles.overlay} width={320} height={240} />
        <canvas ref={captureCanvasRef} className={styles.hiddenCanvas} width={320} height={240} />
        {!isActive && <span className={styles.placeholder}>Start the camera to view live landmarks.</span>}
        {isActive && !detected && <span className={styles.alignHint}>Center your face in the frame</span>}
      </div>

      <div className={styles.controls}>
        {!isActive ? (
          <button type="button" className={styles.primaryButton} onClick={() => void startCamera()}>
            Start camera
          </button>
        ) : (
          <button type="button" className={styles.stopButton} onClick={stopCamera}>
            Stop camera
          </button>
        )}
        <span className={styles.metric}>
          {result?.landmarks.length ?? 0} keypoints
        </span>
        <span className={styles.metric}>
          Quality {Math.round((result?.quality ?? 0) * 100)}%
        </span>
        <span className={styles.metric}>
          {result?.timestamp ? new Date(result.timestamp).toLocaleTimeString() : 'No frame yet'}
        </span>
        <span className={styles.source}>
          {cameraAvailable ? 'Camera permission granted' : 'Camera inactive'}
        </span>
      </div>
    </section>
  );
}
