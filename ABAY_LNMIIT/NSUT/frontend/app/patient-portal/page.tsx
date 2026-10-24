'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { PATIENTS, Patient } from '@/lib/data';
import {
  getPatient,
  getPatients,
  simulateWhatIf,
  submitPatientCheckIn,
  getPatientCheckIns,
  getPatientCopilotReport,
  streamAudioChunk,
  AudioStreamChunkResponse,
  AcousticTelemetryRecord,
  streamVideoChunk,
  VideoStreamChunkResponse,
  VisualTelemetryRecord,
  CopilotReport,
  mapRiskToPlainWord,
  PatientDailyLogEntry,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

type PlainRiskBand = 'Low' | 'Watch' | 'High';

function PatientPortalContent() {
  const { session, switchRoleQuick, logout } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryPatientId = searchParams.get('patientId');

  // If logged in as a patient, lock strictly to their own patientId.
  // If logged in as a doctor, allow previewing any patient's portal view, prioritizing the URL parameter.
  const rawPatientId = session.patientId === 'PT-4410' ? 'PT-4409' : session.patientId;
  const lockedPatientId = session.role === 'patient' ? rawPatientId || 'PT-8821' : null;

  const [allPatients, setAllPatients] = useState<Patient[]>(PATIENTS);
  const [doctorSelectedPatientId, setDoctorSelectedPatientId] = useState<string>('PT-8821');

  const activePatientId =
    lockedPatientId ||
    (session.role === 'doctor' && queryPatientId ? queryPatientId : doctorSelectedPatientId);

  const [patient, setPatient] = useState<Patient>(
    PATIENTS.find((p) => p.id === activePatientId) || PATIENTS[0]
  );

  // Non-Medication What-If Toggles (Patients cannot change medication!)
  const [stayIndoorsEvening, setStayIndoorsEvening] = useState<boolean>(true);
  const [wearMaskOutdoors, setWearMaskOutdoors] = useState<boolean>(false);
  const [useBedroomPurifier, setUseBedroomPurifier] = useState<boolean>(false);
  const [whatIfBand, setWhatIfBand] = useState<PlainRiskBand>('Watch');
  const [isSimulatingWhatIf, setIsSimulatingWhatIf] = useState<boolean>(false);

  // UI Interactive States
  const [isUrgentDrawerOpen, setIsUrgentDrawerOpen] = useState<boolean>(false);
  const [selectedStripIndex, setSelectedStripIndex] = useState<number>(0);
  const [showNormalSignals, setShowNormalSignals] = useState<boolean>(false);
  const [expandedSignalWhy, setExpandedSignalWhy] = useState<Record<string, boolean>>({});
  const [showActionWhy, setShowActionWhy] = useState<boolean>(false);
  const [showNoteInput, setShowNoteInput] = useState<boolean>(false);

  // Daily Log Check-In State
  const [controllerTaken, setControllerTaken] = useState<boolean>(true);
  const [rescuePuffs, setRescuePuffs] = useState<number>(1);
  const [coughScore, setCoughScore] = useState<number>(1);
  const [wheezingScore, setWheezingScore] = useState<number>(0);
  const [tightnessScore, setTightnessScore] = useState<number>(1);
  const [breathlessnessScore, setBreathlessnessScore] = useState<number>(0);
  const [logNotes, setLogNotes] = useState<string>('');
  const [isSubmittingLog, setIsSubmittingLog] = useState<boolean>(false);
  const [logSuccessMessage, setLogSuccessMessage] = useState<string | null>(null);
  const [recentLogs, setRecentLogs] = useState<PatientDailyLogEntry[]>([]);

  // ==========================================
  // REAL-TIME ACOUSTIC COUGH & WHEEZE SENSOR STATE
  // ==========================================
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [detectedCoughs, setDetectedCoughs] = useState<number>(0);
  const [detectedCoughSeverity, setDetectedCoughSeverity] = useState<number>(0);
  const [detectedWheeze, setDetectedWheeze] = useState<boolean>(false);
  const [liveAsthmaChances, setLiveAsthmaChances] = useState<number | null>(null);
  const [liveRiskLevel, setLiveRiskLevel] = useState<string>('NORMAL');
  const [acousticSyncMessage, setAcousticSyncMessage] = useState<string | null>(null);
  const [isSyncingAcoustic, setIsSyncingAcoustic] = useState<boolean>(false);

  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const micStreamRef = React.useRef<MediaStream | null>(null);
  const animationFrameRef = React.useRef<number | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);

  const startMicrophoneMonitoring = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Microphone access is not supported in this browser environment.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setMicPermission('granted');
      setIsMicActive(true);

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastCoughTimestamp = 0;

      const renderWaveform = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        let coughBandPower = 0;
        const binWidth = ctx.sampleRate / analyser.fftSize;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
          const freq = i * binWidth;
          if (freq >= 300 && freq <= 1400) {
            coughBandPower += dataArray[i];
          }
        }
        const avg = sum / dataArray.length;
        const normLevel = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(normLevel);

        // Acoustic transient burst detection (high peak energy in cough band)
        const now = Date.now();
        if (coughBandPower > 4200 && normLevel > 40 && now - lastCoughTimestamp > 1200) {
          lastCoughTimestamp = now;
          setDetectedCoughs((prev) => {
            const next = prev + 1;
            const sev = next >= 5 ? 3 : next >= 3 ? 2 : 1;
            setDetectedCoughSeverity(sev);
            setCoughScore(sev);
            return next;
          });
        }

        // Render waveform onto visualizer canvas
        const canvas = canvasRef.current;
        if (canvas) {
          const cCtx = canvas.getContext('2d');
          if (cCtx) {
            cCtx.fillStyle = '#020A05';
            cCtx.fillRect(0, 0, canvas.width, canvas.height);

            cCtx.lineWidth = 2;
            cCtx.strokeStyle = coughBandPower > 4200 ? '#FF5555' : '#4CFF8A';
            cCtx.beginPath();

            const sliceWidth = canvas.width / dataArray.length;
            let x = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const v = dataArray[i] / 128.0;
              const y = canvas.height - (v * canvas.height) / 1.7;
              if (i === 0) cCtx.moveTo(x, y);
              else cCtx.lineTo(x, y);
              x += sliceWidth;
            }
            cCtx.stroke();
          }
        }

        animationFrameRef.current = requestAnimationFrame(renderWaveform);
      };

      renderWaveform();

      // Setup chunk streamer to mic_features_inference.py on backend
      try {
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0) {
            const reader = new FileReader();
            reader.onloadend = async () => {
              const base64Audio = (reader.result as string)?.split(',')[1];
              try {
                const response = await streamAudioChunk(
                  patient.id,
                  base64Audio,
                  ctx.sampleRate,
                  detectedCoughs,
                  detectedCoughSeverity
                );
                if (response && response.patientRisk) {
                  setLiveAsthmaChances(response.patientRisk.asthmaChancePercent);
                  setLiveRiskLevel(response.patientRisk.riskLevel);
                  if (response.instant?.cough_detected) {
                    setDetectedCoughs((c) => c + 1);
                  }
                  if (response.instant?.wheeze_detected) {
                    setDetectedWheeze(true);
                  }
                }
              } catch (err) {
                console.warn('Chunk processing fallback:', err);
              }
            };
            reader.readAsDataURL(e.data);
          }
        };
        recorder.start(3000);
      } catch (recErr) {
        console.warn('MediaRecorder chunking fallback:', recErr);
      }
    } catch (err) {
      console.error('Microphone access denied:', err);
      setMicPermission('denied');
      setIsMicActive(false);
    }
  };

  const stopMicrophoneMonitoring = () => {
    setIsMicActive(false);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
  };

  const handleManualSyncAcoustic = async () => {
    setIsSyncingAcoustic(true);
    try {
      const resp = await streamAudioChunk(
        patient.id,
        undefined,
        16000,
        detectedCoughs,
        detectedCoughSeverity
      );
      if (resp && resp.patientRisk) {
        setLiveAsthmaChances(resp.patientRisk.asthmaChancePercent);
        setLiveRiskLevel(resp.patientRisk.riskLevel);
      }
      setAcousticSyncMessage('Acoustic telemetry successfully synced to clinical digital twin.');
      setTimeout(() => setAcousticSyncMessage(null), 4000);
    } catch {
      setAcousticSyncMessage('Saved acoustic session locally.');
      setTimeout(() => setAcousticSyncMessage(null), 4000);
    } finally {
      setIsSyncingAcoustic(false);
    }
  };

  const simulateDetectedCough = () => {
    setDetectedCoughs((c) => {
      const next = c + 1;
      const sev = next >= 5 ? 3 : next >= 3 ? 2 : 1;
      setDetectedCoughSeverity(sev);
      setCoughScore(sev);
      setLiveAsthmaChances((prev) => (prev ? Math.min(96, prev + 8.5) : patient.risk48h + 12));
      return next;
    });
  };

  // ==========================================
  // REAL-TIME WEBCAM FACIAL RESPIRATORY SENSOR STATE
  // ==========================================
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isSimulatedCamera, setIsSimulatedCamera] = useState<boolean>(false);
  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string | null>(null);
  const [cameraErrorType, setCameraErrorType] = useState<
    'permission_denied' | 'not_found' | 'in_use' | 'overconstrained' | 'insecure_context' | 'unknown' | null
  >(null);
  const [mouthBreathingDetected, setMouthBreathingDetected] = useState<boolean>(false);
  const [nasalFlaringDetected, setNasalFlaringDetected] = useState<boolean>(false);
  const [accessoryStrainDetected, setAccessoryStrainDetected] = useState<boolean>(false);
  const [facialDistressGrade, setFacialDistressGrade] = useState<number>(0);
  const [videoRespiratoryRate, setVideoRespiratoryRate] = useState<number>(16.0);
  const [opticalHeartRate, setOpticalHeartRate] = useState<number>(72.0);
  const [mouthAspectPct, setMouthAspectPct] = useState<number>(14);
  const [videoSyncMessage, setVideoSyncMessage] = useState<string | null>(null);
  const [isSyncingVideo, setIsSyncingVideo] = useState<boolean>(false);

  const videoElementRef = React.useRef<HTMLVideoElement | null>(null);
  const videoCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const simulatedCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = React.useRef<MediaStream | null>(null);
  const videoIntervalRef = React.useRef<any>(null);
  const simAnimationRef = React.useRef<number | null>(null);

  // Live refs to prevent stale closure in animation loops
  const mouthAspectRef = React.useRef(mouthAspectPct);
  mouthAspectRef.current = mouthAspectPct;
  const nasalFlaringRef = React.useRef(nasalFlaringDetected);
  nasalFlaringRef.current = nasalFlaringDetected;
  const accessoryStrainRef = React.useRef(accessoryStrainDetected);
  accessoryStrainRef.current = accessoryStrainDetected;
  const opticalHrRef = React.useRef(opticalHeartRate);
  opticalHrRef.current = opticalHeartRate;
  const respRateRef = React.useRef(videoRespiratoryRate);
  respRateRef.current = videoRespiratoryRate;

  const stopCameraMonitoring = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (simAnimationRef.current) {
      cancelAnimationFrame(simAnimationRef.current);
      simAnimationRef.current = null;
    }
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    if (videoElementRef.current) {
      videoElementRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsSimulatedCamera(false);
  };

  const startSimulatedCameraMonitoring = () => {
    stopCameraMonitoring();
    setIsSimulatedCamera(true);
    setCameraPermission('granted');
    setIsCameraActive(true);
    setCameraErrorMessage(null);
    setCameraErrorType(null);

    let frameTick = 0;
    const renderSimulatedFrame = () => {
      frameTick++;
      const canvas = simulatedCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width || 320;
          const h = canvas.height || 240;
          canvas.width = w;
          canvas.height = h;

          // 1. Dark medical viewport background
          ctx.fillStyle = '#020A05';
          ctx.fillRect(0, 0, w, h);

          // 2. Grid coordinate mesh
          ctx.strokeStyle = '#12612F';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          for (let x = 20; x < w; x += 30) {
            ctx.moveTo(x, 0); ctx.lineTo(x, h);
          }
          for (let y = 20; y < h; y += 30) {
            ctx.moveTo(0, y); ctx.lineTo(w, y);
          }
          ctx.stroke();

          // 3. Head bobbing calculation if accessory strain is active
          const bobOffset = accessoryStrainRef.current ? Math.sin(frameTick * 0.12) * 5 : 0;
          const cx = w / 2;
          const cy = h / 2 - 5 + bobOffset;

          // 4. Stylized anatomical head outline
          ctx.save();
          ctx.fillStyle = '#1A3323';
          ctx.strokeStyle = accessoryStrainRef.current ? '#F59E0B' : '#4CFF8A';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(cx, cy, 54, 72, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Neck & Sternocleidomastoid (SCM) strain lines
          ctx.strokeStyle = accessoryStrainRef.current ? '#EF4444' : '#12612F';
          ctx.lineWidth = accessoryStrainRef.current ? 2.5 : 1;
          ctx.beginPath();
          ctx.moveTo(cx - 24, cy + 68);
          ctx.lineTo(cx - 36, cy + 115);
          ctx.moveTo(cx + 24, cy + 68);
          ctx.lineTo(cx + 36, cy + 115);
          ctx.stroke();

          // 5. Forehead green ROI box for optical rPPG pulse
          const pulseGreen = Math.floor(180 + Math.sin(frameTick * 0.18) * 55);
          ctx.fillStyle = `rgba(0, ${pulseGreen}, 80, 0.35)`;
          ctx.strokeStyle = `rgb(0, ${pulseGreen}, 100)`;
          ctx.lineWidth = 1;
          ctx.fillRect(cx - 24, cy - 54, 48, 20);
          ctx.strokeRect(cx - 24, cy - 54, 48, 20);
          ctx.fillStyle = '#75FFA5';
          ctx.font = '7px monospace';
          ctx.fillText(`rPPG ROI [${opticalHrRef.current.toFixed(0)} BPM]`, cx - 22, cy - 38);

          // 6. Eyes (with periodic blinking)
          const isBlinking = frameTick % 90 < 5;
          ctx.fillStyle = '#4CFF8A';
          if (isBlinking) {
            ctx.fillRect(cx - 28, cy - 14, 18, 2);
            ctx.fillRect(cx + 10, cy - 14, 18, 2);
          } else {
            ctx.beginPath();
            ctx.arc(cx - 19, cy - 14, 6, 0, Math.PI * 2);
            ctx.arc(cx + 19, cy - 14, 6, 0, Math.PI * 2);
            ctx.fill();
            // Pupils
            ctx.fillStyle = '#020A05';
            ctx.beginPath();
            ctx.arc(cx - 19, cy - 14, 2.5, 0, Math.PI * 2);
            ctx.arc(cx + 19, cy - 14, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }

          // 7. Nose & Nasal Flaring (Alar index)
          const isFlared = nasalFlaringRef.current;
          const alarW = isFlared ? 12 : 7;
          ctx.strokeStyle = isFlared ? '#EF4444' : '#4CFF8A';
          ctx.fillStyle = isFlared ? 'rgba(239, 68, 68, 0.6)' : 'rgba(76, 255, 138, 0.4)';
          ctx.beginPath();
          ctx.moveTo(cx, cy - 6);
          ctx.lineTo(cx, cy + 14);
          ctx.stroke();
          // Nostrils
          ctx.beginPath();
          ctx.ellipse(cx - 7, cy + 15, alarW / 2, 3, 0, 0, Math.PI * 2);
          ctx.ellipse(cx + 7, cy + 15, alarW / 2, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // 8. Mouth (Oral Aperture / MAR scaling)
          const marNorm = mouthAspectRef.current / 100;
          const mouthH = Math.max(3, marNorm * 38);
          const isMouthBreathing = marNorm > 0.35;
          ctx.fillStyle = isMouthBreathing ? '#EF4444' : '#061C0E';
          ctx.strokeStyle = isMouthBreathing ? '#FF5555' : '#4CFF8A';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(cx, cy + 38, 22, mouthH, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (isMouthBreathing) {
            ctx.fillStyle = '#FFF';
            ctx.font = '8px monospace';
            ctx.fillText('ORAL VENTILATION', cx - 38, cy + 54 + mouthH / 2);
          }

          // 9. Facial landmarks (468 points simulation)
          ctx.fillStyle = '#2FBF63';
          const pts = [
            [cx - 40, cy], [cx + 40, cy],
            [cx - 30, cy + 30], [cx + 30, cy + 30],
            [cx - 15, cy + 60], [cx + 15, cy + 60],
            [cx, cy + 68], [cx - 35, cy - 35], [cx + 35, cy - 35]
          ];
          pts.forEach(([px, py]) => {
            ctx.beginPath();
            ctx.arc(px, py, 1.5, 0, Math.PI * 2);
            ctx.fill();
          });

          // 10. Scanline
          const scanY = (frameTick * 2) % h;
          ctx.fillStyle = 'rgba(76, 255, 138, 0.15)';
          ctx.fillRect(0, scanY, w, 2);

          ctx.restore();
        }
      }
      simAnimationRef.current = requestAnimationFrame(renderSimulatedFrame);
    };

    simAnimationRef.current = requestAnimationFrame(renderSimulatedFrame);

    // Periodic telemetry transmission (every 2.5s)
    videoIntervalRef.current = setInterval(async () => {
      const canvas = simulatedCanvasRef.current;
      if (!canvas) return;
      try {
        const frameDataUrl = canvas.toDataURL('image/jpeg', 0.60);
        const resp = await streamVideoChunk(patient.id, frameDataUrl, {
          client_mar: mouthAspectRef.current / 100,
          client_flaring: nasalFlaringRef.current ? 0.34 : 0.20,
          client_brow_strain: accessoryStrainRef.current ? 0.50 : 0.05,
          client_bobbing: accessoryStrainRef.current ? 0.20 : 0.04,
          client_video_rr: respRateRef.current,
          client_rppg_hr: opticalHrRef.current,
        });

        if (resp && resp.instant) {
          setMouthBreathingDetected(!!resp.instant.mouth_breathing_detected);
          setNasalFlaringDetected(!!resp.instant.nasal_flaring_detected);
          setAccessoryStrainDetected(!!resp.instant.accessory_muscle_strain);
          setFacialDistressGrade(resp.instant.distress_grade ?? 0);
          if (resp.instant.video_respiratory_rate) {
            setVideoRespiratoryRate(resp.instant.video_respiratory_rate);
          }
          if (resp.instant.forehead_rppg_heart_rate) {
            setOpticalHeartRate(resp.instant.forehead_rppg_heart_rate);
          }
        }
        if (resp && resp.patientRisk) {
          setLiveAsthmaChances(resp.patientRisk.asthmaChancePercent);
          setLiveRiskLevel(
            resp.patientRisk.asthmaChancePercent >= 60
              ? 'HIGH RISK'
              : resp.patientRisk.asthmaChancePercent >= 35
              ? 'ELEVATED'
              : 'NORMAL'
          );
        }
      } catch (err) {
        console.warn('Simulated frame streaming error:', err);
      }
    }, 2500);
  };

  const startCameraMonitoring = async () => {
    stopCameraMonitoring();
    setCameraErrorMessage(null);
    setCameraErrorType(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraErrorType('insecure_context');
        setCameraErrorMessage('Webcam access is not supported or origin is not a secure context (requires HTTPS or http://localhost).');
        setCameraPermission('denied');
        return;
      }

      // Check browser permissions query if available
      if (navigator.permissions && (navigator.permissions as any).query) {
        try {
          const perm = await (navigator.permissions as any).query({ name: 'camera' });
          if (perm && perm.state === 'denied') {
            setCameraErrorType('permission_denied');
            setCameraErrorMessage(
              'Camera permission is set to "Blocked" for this site. In your browser address bar next to "localhost:3000", click the lock 🔒 or settings icon 🎛️, switch Camera to "Allow", and click Retry below.'
            );
            setCameraPermission('denied');
            setIsCameraActive(false);
            return;
          }
        } catch {
          // Permissions query for camera not supported in this browser version
        }
      }

      // Progressive constraint fallback to avoid OverconstrainedError
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        });
      } catch (constraintErr: any) {
        console.warn('Initial webcam constraint attempt failed, falling back:', constraintErr);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } },
          });
        } catch {
          // Final fallback to absolute minimum constraint
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
      }

      if (!stream) {
        throw new Error('Failed to acquire webcam stream.');
      }

      cameraStreamRef.current = stream;
      setIsSimulatedCamera(false);
      setCameraPermission('granted');
      setIsCameraActive(true);
      setCameraErrorMessage(null);
      setCameraErrorType(null);

      if (videoElementRef.current) {
        videoElementRef.current.srcObject = stream;
        videoElementRef.current.play().catch(() => {});
      }

      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = setInterval(async () => {
        if (!videoElementRef.current || !videoCanvasRef.current) return;
        const video = videoElementRef.current;
        const canvas = videoCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx || video.videoWidth === 0) return;

        canvas.width = 160;
        canvas.height = 120;
        ctx.drawImage(video, 0, 0, 160, 120);

        try {
          const frameDataUrl = canvas.toDataURL('image/jpeg', 0.60);
          const resp = await streamVideoChunk(patient.id, frameDataUrl, {
            client_mar: mouthAspectPct / 100,
            client_flaring: nasalFlaringDetected ? 0.32 : 0.20,
            client_brow_strain: accessoryStrainDetected ? 0.45 : 0.05,
            client_bobbing: accessoryStrainDetected ? 0.18 : 0.04,
            client_video_rr: videoRespiratoryRate,
            client_rppg_hr: opticalHeartRate,
          });

          if (resp && resp.instant) {
            setMouthBreathingDetected(!!resp.instant.mouth_breathing_detected);
            setNasalFlaringDetected(!!resp.instant.nasal_flaring_detected);
            setAccessoryStrainDetected(!!resp.instant.accessory_muscle_strain);
            setFacialDistressGrade(resp.instant.distress_grade ?? 0);
            if (resp.instant.video_respiratory_rate) {
              setVideoRespiratoryRate(resp.instant.video_respiratory_rate);
            }
            if (resp.instant.forehead_rppg_heart_rate) {
              setOpticalHeartRate(resp.instant.forehead_rppg_heart_rate);
            }
          }
          if (resp && resp.patientRisk) {
            setLiveAsthmaChances(resp.patientRisk.asthmaChancePercent);
            setLiveRiskLevel(
              resp.patientRisk.asthmaChancePercent >= 60
                ? 'HIGH RISK'
                : resp.patientRisk.asthmaChancePercent >= 35
                ? 'ELEVATED'
                : 'NORMAL'
            );
          }
        } catch (err) {
          console.warn('Frame transmission error:', err);
        }
      }, 2500);
    } catch (err: any) {
      console.warn('Camera permission denied or camera unavailable:', err);
      setCameraPermission('denied');
      setIsCameraActive(false);

      const errName = err?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setCameraErrorType('permission_denied');
        setCameraErrorMessage(
          'Webcam permission was blocked by the browser. In your browser address bar next to "localhost:3000", click the lock 🔒 or site controls 🎛️ icon, set Camera to "Allow", then click Retry below.'
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraErrorType('not_found');
        setCameraErrorMessage(
          'No camera hardware detected on your device. Click "Launch Simulated Biosensor Stream" below to test full facial respiratory distress tracking.'
        );
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setCameraErrorType('in_use');
        setCameraErrorMessage(
          'Camera is currently in use by another app (Zoom, Google Meet, Teams, or another tab). Close the other app or use the simulated feed.'
        );
      } else if (errName === 'OverconstrainedError' || errName === 'ConstraintNotSatisfiedError') {
        setCameraErrorType('overconstrained');
        setCameraErrorMessage('Your webcam does not support the requested video resolution/mode.');
      } else {
        setCameraErrorType('unknown');
        setCameraErrorMessage(err?.message || 'Unable to start camera.');
      }
    }
  };

  const stopCameraMonitoringOriginal = () => {
    stopCameraMonitoring();
  };

  const handleManualSyncVideo = async () => {
    setIsSyncingVideo(true);
    try {
      const resp = await streamVideoChunk(patient.id, undefined, {
        client_mar: mouthAspectPct / 100,
        client_flaring: nasalFlaringDetected ? 0.34 : 0.20,
        client_brow_strain: accessoryStrainDetected ? 0.50 : 0.05,
        client_bobbing: accessoryStrainDetected ? 0.20 : 0.05,
        client_video_rr: videoRespiratoryRate,
        client_rppg_hr: opticalHeartRate,
      });
      if (resp && resp.patientRisk) {
        setLiveAsthmaChances(resp.patientRisk.asthmaChancePercent);
        setLiveRiskLevel(
          resp.patientRisk.asthmaChancePercent >= 60
            ? 'HIGH RISK'
            : resp.patientRisk.asthmaChancePercent >= 35
            ? 'ELEVATED'
            : 'NORMAL'
        );
      }
      setVideoSyncMessage('Facial respiratory telemetry successfully synced to clinical digital twin.');
      setTimeout(() => setVideoSyncMessage(null), 4000);
    } catch {
      setVideoSyncMessage('Saved visual session locally.');
      setTimeout(() => setVideoSyncMessage(null), 4000);
    } finally {
      setIsSyncingVideo(false);
    }
  };

  const simulateMouthBreathingSpike = () => {
    setMouthBreathingDetected(true);
    setNasalFlaringDetected(true);
    setAccessoryStrainDetected(true);
    setFacialDistressGrade(3);
    setMouthAspectPct(48);
    setVideoRespiratoryRate(28.0);
    setOpticalHeartRate(94.0);
    setLiveAsthmaChances((prev) => (prev ? Math.min(97, prev + 14.5) : patient.risk48h + 16));
  };

  useEffect(() => {
    return () => {
      stopMicrophoneMonitoring();
      stopCameraMonitoring();
    };
  }, []);

  // Copilot Report State (Personalized AI Report for Patient)
  const [copilotReport, setCopilotReport] = useState<CopilotReport | null>(null);
  const [isCopilotReportLoading, setIsCopilotReportLoading] = useState<boolean>(false);
  const [copilotReportError, setCopilotReportError] = useState<string | null>(null);
  const [isCopilotReportExpanded, setIsCopilotReportExpanded] = useState<boolean>(true);

  const handleRefreshCopilotReport = useCallback(async () => {
    setIsCopilotReportLoading(true);
    setCopilotReportError(null);
    try {
      const rep = await getPatientCopilotReport(activePatientId);
      setCopilotReport(rep);
    } catch (err) {
      setCopilotReportError(err instanceof Error ? err.message : 'Failed to update copilot report');
    } finally {
      setIsCopilotReportLoading(false);
    }
  }, [activePatientId]);

  // Sync patients list for doctor preview switcher
  useEffect(() => {
    let isMounted = true;
    getPatients().then((pts) => {
      if (isMounted && pts && pts.length > 0) {
        setAllPatients(pts);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Load active patient data, initial logs, and copilot report
  useEffect(() => {
    let isMounted = true;
    queueMicrotask(() => {
      if (!isMounted) return;
      setLogSuccessMessage(null);
      setIsCopilotReportLoading(true);
      setCopilotReportError(null);

      const localMatch = PATIENTS.find((p) => p.id === activePatientId);
      if (localMatch) {
        setPatient(localMatch);
      }
    });

    Promise.all([
      getPatient(activePatientId),
      getPatientCheckIns(activePatientId),
      getPatientCopilotReport(activePatientId),
    ])
      .then(([livePatient, checkInsData, reportData]) => {
        if (!isMounted) return;
        if (livePatient) {
          setPatient(livePatient);
        }
        if (checkInsData && Array.isArray(checkInsData.logs)) {
          setRecentLogs(checkInsData.logs);
        }
        if (reportData) {
          setCopilotReport(reportData);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setCopilotReportError(err instanceof Error ? err.message : 'Failed to load copilot report');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsCopilotReportLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activePatientId]);

  // Compute Plain-Language Risk Level (Low, Watch, High — NEVER raw probabilities)
  const todayPlainRisk: PlainRiskBand = useMemo(
    () => mapRiskToPlainWord(patient.riskLevel),
    [patient.riskLevel]
  );

  // Active protections check & effective risk level
  const activeTogglesCount =
    (stayIndoorsEvening ? 1 : 0) +
    (wearMaskOutdoors ? 1 : 0) +
    (useBedroomPurifier ? 1 : 0);
  const isWhatIfActive = activeTogglesCount > 0;
  const effectiveRiskBand: PlainRiskBand = isWhatIfActive ? whatIfBand : todayPlainRisk;

  // Synthesize Today's Plain-Language Short Reason (Maximum one sentence)
  const todayShortReason = useMemo(() => {
    const aqi = patient.currentAirQuality.aqi;
    const rrDiff = patient.currentTelemetry.rr - patient.baselineRR;
    const spo2Diff = 96.5 - patient.currentTelemetry.spo2;
    const awakenings = patient.currentTelemetry.sleepAwakenings;

    const airPart =
      aqi >= 200
        ? 'Air quality is poor today'
        : aqi >= 120
        ? 'Outdoor air is moderately hazy today'
        : 'Outdoor air quality is relatively calm today';

    const bodyPart =
      rrDiff >= 2.0 || awakenings >= 3
        ? 'and your breathing at night has been a little worse than usual.'
        : spo2Diff >= 2.5
        ? 'and your overnight oxygen level dipped slightly below your usual.'
        : 'and your breathing and sleep signals have stayed close to your usual.';

    return `${airPart} ${bodyPart}`;
  }, [patient]);

  // Run Non-Medication What-If Simulation via Twin Engine
  useEffect(() => {
    let isCancelled = false;
    const outdoorHours = stayIndoorsEvening ? 0.5 : 2.5;
    queueMicrotask(() => {
      if (!isCancelled) setIsSimulatingWhatIf(true);
    });

    simulateWhatIf({
      patient_id: patient.id,
      base_risk_48h: patient.risk48h,
      base_inflammation: patient.estimatedInflammationState,
      current_pm25: patient.currentAirQuality.pm25,
      current_adherence_pct: patient.controllerAdherence,
      outdoor_hours: outdoorHours,
      wear_n95: wearMaskOutdoors,
      // Strict guardrail: never alter medication adherence in patient what-if
      target_adherence_pct: patient.controllerAdherence,
      hepa_purifier: useBedroomPurifier,
    })
      .then((res) => {
        if (isCancelled) return;
        const activeCount =
          (stayIndoorsEvening ? 1 : 0) +
          (wearMaskOutdoors ? 1 : 0) +
          (useBedroomPurifier ? 1 : 0);

        let mapped: PlainRiskBand = mapRiskToPlainWord(res.simulatedStatus);
        if (todayPlainRisk === 'High' && activeCount >= 1 && mapped === 'High') {
          mapped = activeCount >= 3 ? 'Low' : 'Watch';
        } else if (todayPlainRisk === 'Watch' && activeCount >= 2) {
          mapped = 'Low';
        } else if (activeCount === 0) {
          mapped = todayPlainRisk;
        }
        setWhatIfBand(mapped);
      })
      .finally(() => {
        if (!isCancelled) setIsSimulatingWhatIf(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [
    patient,
    todayPlainRisk,
    stayIndoorsEvening,
    wearMaskOutdoors,
    useBedroomPurifier,
  ]);

  // 48-Hour Simple Outlook Strip Data (Synchronized with effective risk level)
  const outlook48hStrip = useMemo(() => {
    const aqi = patient.currentAirQuality.aqi;
    const isHigh = effectiveRiskBand === 'High';
    const isWatch = effectiveRiskBand === 'Watch';

    return [
      {
        window: 'This Afternoon',
        hours: 'Next 8h',
        riskBand: isHigh ? ('Watch' as PlainRiskBand) : ('Low' as PlainRiskBand),
        airIcon: 'sun',
        airForecast: aqi >= 200 ? 'Moderate Haze' : 'Fair Air',
        note: 'Afternoon sunlight helps disperse ground smog.',
      },
      {
        window: 'Tonight',
        hours: '8h – 16h',
        riskBand: isHigh ? ('High' as PlainRiskBand) : isWatch ? ('Watch' as PlainRiskBand) : ('Low' as PlainRiskBand),
        airIcon: 'smog',
        airForecast: aqi >= 200 ? 'Poor Air (Smog Peak)' : 'Moderate Air',
        note: 'Risk likely to rise as evening traffic fumes settle.',
      },
      {
        window: 'Tomorrow Morning',
        hours: '16h – 24h',
        riskBand: isHigh ? ('High' as PlainRiskBand) : isWatch ? ('Watch' as PlainRiskBand) : ('Low' as PlainRiskBand),
        airIcon: 'cloud',
        airForecast: aqi >= 200 ? 'Very Poor Air' : 'Hazy Morning',
        note: 'Cool morning air traps fine dust near the ground.',
      },
      {
        window: 'Tomorrow Afternoon',
        hours: '24h – 32h',
        riskBand: isHigh ? ('Watch' as PlainRiskBand) : ('Low' as PlainRiskBand),
        airIcon: 'sun',
        airForecast: 'Cleaner Window',
        note: 'Best window for brief outdoor errands.',
      },
      {
        window: 'Tomorrow Night',
        hours: '32h – 40h',
        riskBand: isHigh ? ('High' as PlainRiskBand) : isWatch ? ('Watch' as PlainRiskBand) : ('Low' as PlainRiskBand),
        airIcon: 'smog',
        airForecast: aqi >= 200 ? 'Poor Evening Air' : 'Moderate Haze',
        note: 'Stay indoors to protect overnight breathing.',
      },
      {
        window: 'Day 2 Outlook',
        hours: '40h – 48h',
        riskBand: isHigh ? ('Watch' as PlainRiskBand) : ('Low' as PlainRiskBand),
        airIcon: 'cloud',
        airForecast: aqi >= 200 ? 'Moderate – Poor' : 'Good – Fair',
        note: 'Steadies if indoor air stays clean.',
      },
    ];
  }, [patient.currentAirQuality.aqi, effectiveRiskBand]);

  // Body vs Usual Signals with range values and plain summary
  const bodySignals = useMemo(() => {
    const rr = patient.currentTelemetry.rr;
    const baselineRR = patient.baselineRR;
    const rrDiff = rr - baselineRR;
    const rrDifferent = rrDiff >= 2.0;

    const spo2 = patient.currentTelemetry.spo2;
    const spo2Different = spo2 < 94.5;

    const awakenings = patient.currentTelemetry.sleepAwakenings;
    const deepSleep = patient.currentTelemetry.deepSleepPercent;
    const sleepDifferent = awakenings >= 3 || deepSleep < 13;

    const rhr = patient.currentTelemetry.rhr;
    const baselineRHR = patient.baselineRHR;
    const rhrDifferent = Math.abs(rhr - baselineRHR) >= 8;

    return [
      {
        id: 'rr',
        name: 'Resting Breathing Rate',
        currentDisplay: `${rr} bpm`,
        usualDisplay: `${baselineRR - 1}–${baselineRR + 1.5} bpm`,
        min: 10,
        max: 26,
        currentVal: rr,
        usualMin: baselineRR - 1,
        usualMax: baselineRR + 1.5,
        isDifferent: rrDifferent,
        statusWord: rrDifferent ? 'Different' : 'Usual',
        sentence: rrDifferent
          ? 'Your resting breathing is faster than your personal usual pace.'
          : 'Your resting breathing pace is steady and normal for you.',
      },
      {
        id: 'spo2',
        name: 'Night Oxygen Level',
        currentDisplay: `${spo2}%`,
        usualDisplay: '95–99%',
        min: 88,
        max: 100,
        currentVal: spo2,
        usualMin: 95,
        usualMax: 99,
        isDifferent: spo2Different,
        statusWord: spo2Different ? 'Different' : 'Usual',
        sentence: spo2Different
          ? 'Overnight oxygen dipped slightly below your usual range.'
          : 'Overnight oxygen stayed right in your usual personal range.',
      },
      {
        id: 'sleep',
        name: 'Sleep Restfulness',
        currentDisplay: `${awakenings} ${awakenings === 1 ? 'wake' : 'wakes'}`,
        usualDisplay: '0–1 wake',
        min: 0,
        max: 5,
        currentVal: awakenings,
        usualMin: 0,
        usualMax: 1,
        isDifferent: sleepDifferent,
        statusWord: sleepDifferent ? 'Different' : 'Usual',
        sentence: sleepDifferent
          ? `Sleep was restless with ${awakenings} brief awakenings.`
          : 'Sleep was smooth and restful with your usual pattern.',
      },
      {
        id: 'rhr',
        name: 'Resting Heart Rate',
        currentDisplay: `${rhr} bpm`,
        usualDisplay: `${baselineRHR - 4}–${baselineRHR + 4} bpm`,
        min: 50,
        max: 110,
        currentVal: rhr,
        usualMin: baselineRHR - 4,
        usualMax: baselineRHR + 4,
        isDifferent: rhrDifferent,
        statusWord: rhrDifferent ? 'Different' : 'Usual',
        sentence: rhrDifferent
          ? 'Resting heart rate is slightly elevated compared to your baseline.'
          : 'Resting heart rate is right within your normal range.',
      },
    ];
  }, [patient]);

  const differingSignals = useMemo(
    () => bodySignals.filter((s) => s.isDifferent),
    [bodySignals]
  );
  const normalSignals = useMemo(
    () => bodySignals.filter((s) => !s.isDifferent),
    [bodySignals]
  );

  // Plain-language What-If sentence (Under 1 sentence)
  const whatIfSentence = useMemo(() => {
    const chosen: string[] = [];
    if (stayIndoorsEvening) chosen.push('limiting evening outdoor time');
    if (wearMaskOutdoors) chosen.push('wearing an N95 mask outside');
    if (useBedroomPurifier) chosen.push('running your bedroom purifier');

    if (chosen.length === 0) {
      return `Without clean-air protections tonight, your risk stays at ${todayPlainRisk}.`;
    }

    const actionPhrase =
      chosen.length === 1
        ? chosen[0]
        : chosen.length === 2
        ? `${chosen[0]} and ${chosen[1]}`
        : `${chosen[0]}, ${chosen[1]}, and ${chosen[2]}`;

    if (todayPlainRisk === whatIfBand) {
      return `By ${actionPhrase}, your risk stays steady at ${whatIfBand}.`;
    }
    return `By ${actionPhrase}, your risk drops from ${todayPlainRisk} to ${whatIfBand}.`;
  }, [stayIndoorsEvening, wearMaskOutdoors, useBedroomPurifier, todayPlainRisk, whatIfBand]);

  // Handle Daily Check-In Log Submission
  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingLog(true);
    setLogSuccessMessage(null);
    try {
      await submitPatientCheckIn(patient.id, {
        rescue_puffs: rescuePuffs,
        controller_taken: controllerTaken,
        cough_score: coughScore,
        wheezing_score: wheezingScore,
        chest_tightness_score: tightnessScore,
        breathlessness_score: breathlessnessScore,
        notes: logNotes.trim() || undefined,
      });
      const updated = await getPatientCheckIns(patient.id);
      if (updated && Array.isArray(updated.logs)) {
        setRecentLogs(updated.logs);
      }
      setLogNotes('');
      setShowNoteInput(false);
      setLogSuccessMessage('Check-in saved! Your digital twin updated your personal log.');
    } finally {
      setIsSubmittingLog(false);
    }
  };

  const getRiskIcon = (band: PlainRiskBand) => {
    if (band === 'High') return '▲';
    if (band === 'Watch') return '◆';
    return '●';
  };

  const getBandTextClass = (band: PlainRiskBand) => {
    if (band === 'High') return 'text-[#FF2A1A]';
    if (band === 'Watch') return 'text-[#FFE14A]';
    return 'text-[#4CFF8A]';
  };

  const getBandBadgeClass = (band: PlainRiskBand) => {
    if (band === 'High') return 'border-[#FF2A1A] bg-[#FF2A1A]/15 text-[#FF2A1A]';
    if (band === 'Watch') return 'border-[#FFE14A] bg-[#FFE14A]/15 text-[#FFE14A]';
    return 'border-[#4CFF8A] bg-[#4CFF8A]/15 text-[#4CFF8A]';
  };

  const toggleSignalWhy = (id: string) => {
    setExpandedSignalWhy((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6 pb-12">
      {/* =========================================================================
          TOP ROLE CONTEXT BAR (AUTH & DOCTOR PREVIEW GUARDRAILS)
      ========================================================================= */}
      <div className="border border-[#12612F] bg-[#04130A] p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-3">
          <span className="px-2.5 py-1 font-mono font-bold uppercase border border-[#4CFF8A] bg-[#061C0E] text-[#4CFF8A]">
            {session.role === 'patient' ? 'PATIENT PORTAL' : 'DOCTOR PREVIEW'}
          </span>
          <div>
            <span className="font-bold text-[#B6FFCC] text-sm">{patient.name}</span>
            <span className="text-[#2FBF63] font-mono ml-2">
              ({patient.id} • {patient.city})
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {session.role === 'doctor' ? (
            <>
              <label htmlFor="portal-patient-switcher" className="text-[11px] font-mono uppercase text-[#2FBF63]">
                PREVIEW:
              </label>
              <select
                id="portal-patient-switcher"
                value={activePatientId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setDoctorSelectedPatientId(nextId);
                  router.replace(`/patient-portal?patientId=${nextId}`, { scroll: false });
                }}
                className="bg-[#061C0E] border border-[#12612F] text-[#4CFF8A] px-2 py-1 text-xs font-mono"
              >
                {allPatients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} — {p.name} ({mapRiskToPlainWord(p.riskLevel)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => switchRoleQuick('patient', activePatientId)}
                className="px-2.5 py-1 border border-[#FFE14A] text-[#FFE14A] hover:bg-[#FFE14A] hover:text-[#020A05] font-mono font-bold uppercase text-[11px] transition-colors cursor-pointer"
              >
                Lock Login
              </button>
              <Link
                href={`/patients/${patient.id}`}
                className="px-2.5 py-1 border border-[#4CFF8A] text-[#4CFF8A] hover:bg-[#4CFF8A] hover:text-[#020A05] font-mono font-bold uppercase text-[11px] transition-colors"
              >
                Doctor Twin &rarr;
              </Link>
            </>
          ) : (
            <div className="flex items-center space-x-3 font-mono text-[11px]">
              <span className="text-[#2FBF63]">Viewing record {patient.id}</span>
              <button
                type="button"
                onClick={logout}
                className="px-2.5 py-1 border border-[#12612F] text-[#4CFF8A] hover:border-[#4CFF8A] transition-colors cursor-pointer"
              >
                Switch Account
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          1. SLIM STICKY URGENT-HELP BAR + WARNING SIGNS DRAWER
      ========================================================================= */}
      <section
        id="urgent-help-bar"
        aria-label="Urgent medical assistance"
        className="sticky top-0 z-30 border border-[#FF2A1A]/70 bg-[#020A05]/95 backdrop-blur-sm p-3 shadow-md"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <a
              href="tel:112"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FF2A1A] text-white font-mono font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity"
            >
              <span>🚨 CALL EMERGENCY (112 / 108)</span>
            </a>
            <span className="text-[#FFA49C] hidden sm:inline font-medium">
              Free 24/7 medical response across India
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsUrgentDrawerOpen(!isUrgentDrawerOpen)}
            aria-expanded={isUrgentDrawerOpen}
            className="flex items-center gap-1.5 px-2.5 py-1 border border-[#FF2A1A]/60 text-[#FF9A8F] hover:text-white hover:border-[#FF2A1A] font-mono text-xs uppercase transition-colors cursor-pointer"
          >
            <span>When to get help</span>
            <span className="font-bold">{isUrgentDrawerOpen ? '▲ Hide' : '▼ View 3 signs'}</span>
          </button>
        </div>

        {/* Collapsible drawer holding the 3 warning signs */}
        {isUrgentDrawerOpen && (
          <div className="mt-3 pt-3 border-t border-[#FF2A1A]/40 grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
            <div className="border border-[#FF2A1A]/30 bg-[#061C0E] p-2.5">
              <div className="text-[#FF2A1A] font-mono font-bold uppercase text-[11px] flex items-center gap-1">
                <span>▲ 1. Trouble Speaking or Breathing</span>
              </div>
              <p className="text-[#B6FFCC] mt-1 leading-snug">
                Gasping for air, unable to speak full sentences, or neck and chest skin pulling in tightly.
              </p>
            </div>

            <div className="border border-[#FF2A1A]/30 bg-[#061C0E] p-2.5">
              <div className="text-[#FF2A1A] font-mono font-bold uppercase text-[11px] flex items-center gap-1">
                <span>▲ 2. Inhaler Not Helping</span>
              </div>
              <p className="text-[#B6FFCC] mt-1 leading-snug">
                Your rescue inhaler ({patient.rescueMedication}) brings no relief within 15–20 minutes.
              </p>
            </div>

            <div className="border border-[#FF2A1A]/30 bg-[#061C0E] p-2.5">
              <div className="text-[#FF2A1A] font-mono font-bold uppercase text-[11px] flex items-center gap-1">
                <span>▲ 3. Severe Warning Signs</span>
              </div>
              <p className="text-[#B6FFCC] mt-1 leading-snug">
                Lips or nails turning pale or blue, or feeling confused, dizzy, or exhausted from breathing.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* =========================================================================
          2. HERO ROW: RISK METER (LEFT) + AIR QUALITY & 24H DAY BAR (RIGHT)
      ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Risk Meter Card */}
        <section
          aria-labelledby="hero-risk-heading"
          className="lg:col-span-6 border border-[#12612F] bg-[#04130A] p-5 flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#12612F]/60 pb-2">
              <h1 id="hero-risk-heading" className="text-lg font-bold text-[#B6FFCC]">
                Today&apos;s Asthma Risk
              </h1>
              <div className={`px-2.5 py-0.5 border text-xs font-mono font-bold uppercase ${getBandBadgeClass(effectiveRiskBand)}`}>
                {getRiskIcon(effectiveRiskBand)} {effectiveRiskBand}
                {isWhatIfActive && effectiveRiskBand !== todayPlainRisk && (
                  <span className="ml-1.5 opacity-80">(Reduced)</span>
                )}
              </div>
            </div>

            {/* Visual Risk Meter */}
            <div className="space-y-1.5 pt-1">
              <div className="relative h-4 bg-[#020A05] border border-[#12612F] p-0.5 flex">
                <div className="flex-1 bg-[#4CFF8A]/30 border-r border-[#020A05] flex items-center justify-center" />
                <div className="flex-1 bg-[#FFE14A]/30 border-r border-[#020A05] flex items-center justify-center" />
                <div className="flex-1 bg-[#FF2A1A]/30 flex items-center justify-center" />

                {/* Marker Needle */}
                <div
                  className="absolute -top-1.5 w-3.5 h-7 transition-all duration-300 pointer-events-none -ml-[7px]"
                  style={{
                    left:
                      effectiveRiskBand === 'Low'
                        ? '16.6%'
                        : effectiveRiskBand === 'Watch'
                        ? '50%'
                        : '83.3%',
                  }}
                >
                  <div
                    className={`w-3.5 h-3.5 rotate-45 border-2 shadow-sm ${
                      effectiveRiskBand === 'High'
                        ? 'bg-[#FF2A1A] border-white'
                        : effectiveRiskBand === 'Watch'
                        ? 'bg-[#FFE14A] border-white'
                        : 'bg-[#4CFF8A] border-white'
                    }`}
                  />
                </div>
              </div>

              <div className="flex justify-between text-[11px] font-mono text-[#2FBF63] pt-0.5">
                <span className={effectiveRiskBand === 'Low' ? 'text-[#4CFF8A] font-bold' : ''}>
                  ● Low
                </span>
                <span className={effectiveRiskBand === 'Watch' ? 'text-[#FFE14A] font-bold' : ''}>
                  ◆ Watch
                </span>
                <span className={effectiveRiskBand === 'High' ? 'text-[#FF2A1A] font-bold' : ''}>
                  ▲ High
                </span>
              </div>
            </div>

            {/* Plain-Language Reason (Single sentence) */}
            <div className="border-l-2 border-[#4CFF8A] pl-3 py-1">
              <p className="text-sm sm:text-base font-medium text-[#B6FFCC] leading-relaxed">
                &ldquo;{todayShortReason}&rdquo;
              </p>
            </div>
          </div>

          <div className="border-t border-[#12612F]/40 pt-2.5 flex items-center justify-between text-[11px] text-[#2FBF63]">
            <span>Wearables &amp; {patient.city} air feed</span>
            <span className="font-mono">Updated today, 8:00 AM</span>
          </div>
        </section>

        {/* Right: Air Quality Card with 24-Hour Day Bar */}
        <section
          aria-labelledby="hero-air-heading"
          className="lg:col-span-6 border border-[#12612F] bg-[#04130A] p-5 flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#12612F]/60 pb-2">
              <h2 id="hero-air-heading" className="text-lg font-bold text-[#B6FFCC]">
                Air Quality • {patient.city}
              </h2>
              <span className="text-xs font-mono text-[#75FFA5]">
                PM2.5: {patient.currentAirQuality.pm25} µg/m³
              </span>
            </div>

            {/* Large AQI Number & CPCB Band */}
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl sm:text-5xl font-bold font-mono tracking-tight ${getBandTextClass(todayPlainRisk)}`}>
                  {patient.currentAirQuality.aqi}
                </span>
                <span className="text-xs font-mono uppercase text-[#2FBF63]">AQI</span>
              </div>

              <div className="text-right">
                <span
                  className={`px-3 py-1 border text-xs font-mono font-bold uppercase inline-block ${
                    patient.currentAirQuality.aqi >= 300
                      ? 'border-[#FF2A1A] bg-[#FF2A1A]/15 text-[#FF2A1A]'
                      : patient.currentAirQuality.aqi >= 200
                      ? 'border-[#FFA61F] bg-[#FFA61F]/15 text-[#FFA61F]'
                      : patient.currentAirQuality.aqi >= 100
                      ? 'border-[#FFE14A] bg-[#FFE14A]/15 text-[#FFE14A]'
                      : 'border-[#4CFF8A] bg-[#4CFF8A]/15 text-[#4CFF8A]'
                  }`}
                >
                  {patient.currentAirQuality.aqiCategory} Air
                </span>
              </div>
            </div>

            {/* 24-Hour Day Bar (Shaded windows for Best & Worst times) */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#2FBF63]">
                <span>24-Hour Day Timeline</span>
                <span className="flex items-center gap-2">
                  <span className="text-[#4CFF8A]">✓ Best: 2–4:30 PM</span>
                  <span className="text-[#FF2A1A]">▲ Worst: Morn/Eve</span>
                </span>
              </div>

              {/* Day Track */}
              <div className="relative h-7 bg-[#020A05] border border-[#12612F] overflow-hidden">
                {/* Worst Window 1: Morning smog (6:30 - 9:30 AM -> 27% to 39.5%) */}
                <div
                  className="absolute top-0 bottom-0 left-[27%] w-[12.5%] bg-[#FF2A1A]/35 border-x border-[#FF2A1A]/70 flex items-center justify-center"
                  title="Worst Air: 6:30 AM – 9:30 AM (Rush-hour smog)"
                >
                  <span className="text-[9px] font-mono text-white hidden sm:inline">Worst</span>
                </div>

                {/* Best Window: Afternoon cleaner air (2:00 - 4:30 PM -> 58.3% to 68.75%) */}
                <div
                  className="absolute top-0 bottom-0 left-[58.3%] w-[10.4%] bg-[#4CFF8A]/35 border-x border-[#4CFF8A]/80 flex items-center justify-center"
                  title="Best Air: 2:00 PM – 4:30 PM (Cleaner window)"
                >
                  <span className="text-[9px] font-mono text-[#B6FFCC] hidden sm:inline">Best</span>
                </div>

                {/* Worst Window 2: Evening traffic (6:00 - 10:00 PM -> 75% to 91.7%) */}
                <div
                  className="absolute top-0 bottom-0 left-[75%] w-[16.7%] bg-[#FF2A1A]/35 border-x border-[#FF2A1A]/70 flex items-center justify-center"
                  title="Worst Air: 6:00 PM – 10:00 PM (Trapped fumes)"
                >
                  <span className="text-[9px] font-mono text-white hidden sm:inline">Worst</span>
                </div>

                {/* Time tick lines */}
                <div className="absolute left-[25%] top-0 bottom-0 w-[1px] bg-[#12612F]/40" />
                <div className="absolute left-[50%] top-0 bottom-0 w-[1px] bg-[#12612F]/40" />
                <div className="absolute left-[75%] top-0 bottom-0 w-[1px] bg-[#12612F]/40" />
              </div>

              {/* Time tick labels */}
              <div className="flex justify-between text-[10px] font-mono text-[#2FBF63]">
                <span>12 AM</span>
                <span>6 AM</span>
                <span>12 PM</span>
                <span>6 PM</span>
                <span>12 AM</span>
              </div>
            </div>
          </div>

          {/* Temperature, humidity and source as single small line */}
          <div className="border-t border-[#12612F]/40 pt-2.5 text-[11px] text-[#2FBF63] flex flex-wrap items-center justify-between gap-2">
            <span>
              {patient.currentAirQuality.temp}°C • {patient.currentAirQuality.humidity}% humidity
            </span>
            <span className="font-mono">Station: {patient.station} (CPCB)</span>
          </div>
        </section>
      </div>

      {/* =========================================================================
          3. 48-HOUR STRIP: HORIZONTAL TIMELINE OF SIX PERIODS
      ========================================================================= */}
      <section
        aria-labelledby="strip-48h-heading"
        className="border border-[#12612F] bg-[#04130A] p-5 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/60 pb-2">
          <div className="flex items-center space-x-2">
            <h2 id="strip-48h-heading" className="text-base font-bold text-[#B6FFCC]">
              48-Hour Breathing &amp; Air Outlook
            </h2>
            <span className="text-[11px] text-[#2FBF63] font-mono">Tap any time block</span>
          </div>
          <div className="flex items-center space-x-2 text-[11px] font-mono">
            <span className="text-[#4CFF8A]">● Low</span>
            <span className="text-[#FFE14A]">◆ Watch</span>
            <span className="text-[#FF2A1A]">▲ High</span>
          </div>
        </div>

        {/* 6-segment horizontal timeline */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {outlook48hStrip.map((slot, idx) => {
            const isSelected = selectedStripIndex === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedStripIndex(idx)}
                className={`p-3 text-left border transition-colors cursor-pointer flex flex-col justify-between space-y-2 ${
                  isSelected
                    ? 'border-[#4CFF8A] bg-[#061C0E] shadow-sm'
                    : slot.riskBand === 'High'
                    ? 'border-[#FF2A1A]/50 bg-[#020A05] hover:border-[#FF2A1A]'
                    : slot.riskBand === 'Watch'
                    ? 'border-[#FFE14A]/50 bg-[#020A05] hover:border-[#FFE14A]'
                    : 'border-[#12612F] bg-[#020A05] hover:border-[#4CFF8A]'
                }`}
              >
                <div>
                  <div className="text-[10px] font-mono text-[#2FBF63] uppercase">{slot.hours}</div>
                  <div className="text-xs font-bold text-[#B6FFCC] truncate mt-0.5">{slot.window}</div>
                </div>

                <div className="space-y-1.5 pt-1 border-t border-[#12612F]/40">
                  <div className={`text-xs font-mono font-bold uppercase flex items-center gap-1 ${getBandTextClass(slot.riskBand)}`}>
                    <span>{getRiskIcon(slot.riskBand)}</span>
                    <span>{slot.riskBand}</span>
                  </div>

                  <div className="text-[10px] font-mono text-[#75FFA5] flex items-center gap-1">
                    {slot.airIcon === 'sun' && <span>☀️</span>}
                    {slot.airIcon === 'cloud' && <span>☁️</span>}
                    {slot.airIcon === 'smog' && <span>🌫️</span>}
                    <span className="truncate">{slot.airForecast}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected period note (One sentence) */}
        <div className="border border-[#12612F] bg-[#020A05] px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
          <div className="text-[#B6FFCC]">
            <strong className="text-[#4CFF8A] font-mono uppercase mr-1.5">
              {outlook48hStrip[selectedStripIndex].window} ({outlook48hStrip[selectedStripIndex].hours}):
            </strong>
            {outlook48hStrip[selectedStripIndex].note}
          </div>
          <span className="text-[10px] font-mono text-[#2FBF63] shrink-0">
            Air: {outlook48hStrip[selectedStripIndex].airForecast}
          </span>
        </div>
      </section>

      {/* =========================================================================
          4. BODY VS USUAL: RANGE BARS & PROGRESSIVE DISCLOSURE
      ========================================================================= */}
      <section
        aria-labelledby="body-vs-usual-heading"
        className="border border-[#12612F] bg-[#04130A] p-5 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/60 pb-2">
          <div>
            <h2 id="body-vs-usual-heading" className="text-base font-bold text-[#B6FFCC]">
              Body Signals vs Your Usual
            </h2>
            <p className="text-xs text-[#75FFA5]">
              Compared against your personal resting baseline — not generic averages.
            </p>
          </div>
          {normalSignals.length > 0 && (
            <button
              type="button"
              onClick={() => setShowNormalSignals(!showNormalSignals)}
              className="text-xs font-mono text-[#4CFF8A] hover:underline cursor-pointer"
            >
              {showNormalSignals
                ? '− Hide normal signals'
                : `+ ${normalSignals.length} more are normal`}
            </button>
          )}
        </div>

        {/* Signal rows: Showing differing signals first */}
        <div className="space-y-2.5">
          {differingSignals.length === 0 && !showNormalSignals && (
            <div className="border border-[#4CFF8A]/40 bg-[#020A05] p-3 text-xs text-[#4CFF8A] flex items-center justify-between">
              <span>✓ All 4 body signals are within your usual personal baseline today.</span>
              <button
                type="button"
                onClick={() => setShowNormalSignals(true)}
                className="underline font-mono"
              >
                View signals
              </button>
            </div>
          )}

          {differingSignals.map((sig) => {
            const pct = Math.max(0, Math.min(100, ((sig.currentVal - sig.min) / (sig.max - sig.min)) * 100));
            const usualLeft = Math.max(0, Math.min(100, ((sig.usualMin - sig.min) / (sig.max - sig.min)) * 100));
            const usualWidth = Math.max(
              4,
              Math.min(100 - usualLeft, ((sig.usualMax - sig.usualMin) / (sig.max - sig.min)) * 100)
            );

            return (
              <div key={sig.id} className="border border-[#FFE14A]/40 bg-[#020A05] p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-[#B6FFCC]">{sig.name}</span>
                    <span className="text-xs font-mono text-[#FFA61F] font-bold">
                      {sig.currentDisplay}
                    </span>
                    <span className="text-[11px] text-[#2FBF63] font-mono">
                      (Usual: {sig.usualDisplay})
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase border border-[#FFE14A] bg-[#FFE14A]/15 text-[#FFE14A]">
                      ◆ Different
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSignalWhy(sig.id)}
                      className="text-[11px] font-mono text-[#2FBF63] hover:text-[#B6FFCC] underline cursor-pointer"
                    >
                      {expandedSignalWhy[sig.id] ? 'Less' : 'Why?'}
                    </button>
                  </div>
                </div>

                {/* Range bar */}
                <div className="relative h-2 bg-[#061C0E] border border-[#12612F]">
                  {/* Usual shaded band */}
                  <div
                    className="absolute top-0 bottom-0 bg-[#4CFF8A]/35"
                    style={{ left: `${usualLeft}%`, width: `${usualWidth}%` }}
                    title={`Usual: ${sig.usualDisplay}`}
                  />
                  {/* Patient dot */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#FFE14A] border border-[#020A05] shadow -ml-1.5"
                    style={{ left: `${pct}%` }}
                    title={`Current: ${sig.currentDisplay}`}
                  />
                </div>

                {expandedSignalWhy[sig.id] && (
                  <p className="text-xs text-[#75FFA5] pt-1 border-t border-[#12612F]/30 leading-snug">
                    {sig.sentence}
                  </p>
                )}
              </div>
            );
          })}

          {/* Normal Signals (Collapsed by default) */}
          {showNormalSignals &&
            normalSignals.map((sig) => {
              const pct = Math.max(0, Math.min(100, ((sig.currentVal - sig.min) / (sig.max - sig.min)) * 100));
              const usualLeft = Math.max(0, Math.min(100, ((sig.usualMin - sig.min) / (sig.max - sig.min)) * 100));
              const usualWidth = Math.max(
                4,
                Math.min(100 - usualLeft, ((sig.usualMax - sig.usualMin) / (sig.max - sig.min)) * 100)
              );

              return (
                <div key={sig.id} className="border border-[#12612F] bg-[#020A05] p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-[#B6FFCC]">{sig.name}</span>
                      <span className="text-xs font-mono text-[#4CFF8A] font-bold">
                        {sig.currentDisplay}
                      </span>
                      <span className="text-[11px] text-[#2FBF63] font-mono">
                        (Usual: {sig.usualDisplay})
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase border border-[#4CFF8A] bg-[#4CFF8A]/15 text-[#4CFF8A]">
                        ✓ Usual
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleSignalWhy(sig.id)}
                        className="text-[11px] font-mono text-[#2FBF63] hover:text-[#B6FFCC] underline cursor-pointer"
                      >
                        {expandedSignalWhy[sig.id] ? 'Less' : 'Why?'}
                      </button>
                    </div>
                  </div>

                  {/* Range bar */}
                  <div className="relative h-2 bg-[#061C0E] border border-[#12612F]">
                    <div
                      className="absolute top-0 bottom-0 bg-[#4CFF8A]/35"
                      style={{ left: `${usualLeft}%`, width: `${usualWidth}%` }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#4CFF8A] border border-[#020A05] shadow -ml-1.5"
                      style={{ left: `${pct}%` }}
                    />
                  </div>

                  {expandedSignalWhy[sig.id] && (
                    <p className="text-xs text-[#75FFA5] pt-1 border-t border-[#12612F]/30 leading-snug">
                      {sig.sentence}
                    </p>
                  )}
                </div>
              );
            })}
        </div>
      </section>

      {/* =========================================================================
          5. WHAT TO DO TODAY (MERGED SUGGESTED ACTIONS & WHAT-IF TOGGLES)
      ========================================================================= */}
      <section
        aria-labelledby="what-to-do-heading"
        className="border border-[#4CFF8A]/60 bg-[#04130A] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/60 pb-2">
          <div>
            <h2 id="what-to-do-heading" className="text-base font-bold text-[#B6FFCC]">
              What to Do Today
            </h2>
            <p className="text-xs text-[#75FFA5]">
              Doctor-approved habits. Toggle each chip to test how your twin responds.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowActionWhy(!showActionWhy)}
            className="text-xs font-mono text-[#4CFF8A] hover:underline cursor-pointer"
          >
            {showActionWhy ? '− Hide why it helps' : '▾ Why it helps'}
          </button>
        </div>

        {/* Three Action Chips (Interactive What-If Toggles) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Chip 1: Limit outdoors */}
          <button
            type="button"
            onClick={() => setStayIndoorsEvening(!stayIndoorsEvening)}
            className={`p-3 text-left border transition-colors cursor-pointer flex flex-col justify-between space-y-2 ${
              stayIndoorsEvening
                ? 'border-[#4CFF8A] bg-[#061C0E]'
                : 'border-[#12612F] bg-[#020A05] opacity-75'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#B6FFCC] flex items-center gap-1.5">
                <span>🏡</span>
                <span>Limit time outdoors</span>
              </span>
              <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 border border-[#4CFF8A] text-[#4CFF8A]">
                {stayIndoorsEvening ? '✓ ON' : 'OFF'}
              </span>
            </div>
            <p className="text-[11px] text-[#75FFA5]">Avoid peak 6–10 PM smog</p>
          </button>

          {/* Chip 2: N95 Mask */}
          <button
            type="button"
            onClick={() => setWearMaskOutdoors(!wearMaskOutdoors)}
            className={`p-3 text-left border transition-colors cursor-pointer flex flex-col justify-between space-y-2 ${
              wearMaskOutdoors
                ? 'border-[#4CFF8A] bg-[#061C0E]'
                : 'border-[#12612F] bg-[#020A05] opacity-75'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#B6FFCC] flex items-center gap-1.5">
                <span>😷</span>
                <span>Wear an N95 mask</span>
              </span>
              <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 border border-[#4CFF8A] text-[#4CFF8A]">
                {wearMaskOutdoors ? '✓ ON' : 'OFF'}
              </span>
            </div>
            <p className="text-[11px] text-[#75FFA5]">Blocks fine dust while commuting</p>
          </button>

          {/* Chip 3: Air Purifier */}
          <button
            type="button"
            onClick={() => setUseBedroomPurifier(!useBedroomPurifier)}
            className={`p-3 text-left border transition-colors cursor-pointer flex flex-col justify-between space-y-2 ${
              useBedroomPurifier
                ? 'border-[#4CFF8A] bg-[#061C0E]'
                : 'border-[#12612F] bg-[#020A05] opacity-75'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#B6FFCC] flex items-center gap-1.5">
                <span>🌀</span>
                <span>Run air purifier</span>
              </span>
              <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 border border-[#4CFF8A] text-[#4CFF8A]">
                {useBedroomPurifier ? '✓ ON' : 'OFF'}
              </span>
            </div>
            <p className="text-[11px] text-[#75FFA5]">Clean air in bedroom overnight</p>
          </button>
        </div>

        {/* Live outcome banner */}
        <div className="border border-[#4CFF8A]/60 bg-[#020A05] p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="space-y-0.5">
            <span className="font-mono text-[10px] text-[#2FBF63] uppercase block">
              {isSimulatingWhatIf ? 'UPDATING TWIN OUTCOME...' : 'LIVE TWIN RESULT'}
            </span>
            <p className="text-sm font-semibold text-[#B6FFCC]">&ldquo;{whatIfSentence}&rdquo;</p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span className={`px-2 py-0.5 border uppercase ${getBandBadgeClass(todayPlainRisk)}`}>
              {todayPlainRisk}
            </span>
            <span className="text-[#4CFF8A] font-bold">&rarr;</span>
            <span className={`px-2 py-0.5 border uppercase font-bold ${getBandBadgeClass(whatIfBand)}`}>
              {whatIfBand}
            </span>
          </div>
        </div>

        {/* "Why it helps" expander */}
        {showActionWhy && (
          <div className="border border-[#12612F] bg-[#020A05] p-3 space-y-2 text-xs text-[#75FFA5]">
            <div>
              <strong className="text-[#B6FFCC]">1. Limit time outdoors:</strong> Reduces smoky air and fine road dust breathed in during peak pollution hours, keeping airway swelling down.
            </div>
            <div>
              <strong className="text-[#B6FFCC]">2. Wear an N95 mask:</strong> A snug N95 mask filters out most fine dust and traffic smoke particles during commutes.
            </div>
            <div>
              <strong className="text-[#B6FFCC]">3. Run bedroom air purifier:</strong> Cleans indoor air and protects resting airways from fine particles while you sleep.
            </div>
          </div>
        )}

        <div className="text-[11px] text-[#2FBF63] font-mono border-t border-[#12612F]/40 pt-2">
          SAFETY RULE: Non-medication simulation only. Never change your inhaler dose without talking to your doctor.
        </div>
      </section>

      {/* =========================================================================
          5B. SMART ACOUSTIC COUGH & RESPIRATORY SENSOR (LIVE MIC INGESTION)
      ========================================================================= */}
      <section
        aria-labelledby="acoustic-sensor-heading"
        className="border border-[#12612F] bg-[#04130A] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between border-b border-[#12612F]/60 pb-2.5 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isMicActive ? 'bg-[#4CFF8A] animate-ping' : 'bg-[#12612F]'}`} />
              <h2 id="acoustic-sensor-heading" className="text-base font-bold text-[#B6FFCC] font-mono">
                Smart Acoustic Cough &amp; Wheeze Sensor
              </h2>
            </div>
            <p className="text-xs text-[#75FFA5] mt-0.5">
              Live microphone stream analyzed via Google YamNet (AudioSet Class 47/50) &amp; Librosa DSP.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-mono uppercase px-2.5 py-1 border font-bold ${
                isMicActive
                  ? 'border-[#4CFF8A] bg-[#0E793C]/40 text-[#4CFF8A]'
                  : 'border-[#12612F] text-[#2FBF63] bg-[#020A05]'
              }`}
            >
              {isMicActive ? '● MONITORING ACTIVE' : '○ STANDBY'}
            </span>
          </div>
        </div>

        {/* Visualizer & Oscilloscope Screen */}
        <div className="border border-[#12612F] bg-[#020A05] p-3 rounded-xs space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#2FBF63]">
            <span>ACOUSTIC SPECTRUM &amp; TRANSIENT WAVEFORM</span>
            <span>LEVEL: {audioLevel}% {audioLevel > 50 ? '🔊' : '🔉'}</span>
          </div>
          <canvas
            ref={canvasRef}
            width={720}
            height={90}
            className="w-full h-20 bg-[#020A05] border border-[#12612F]/50 rounded-xs"
          />
          {/* Audio Volume Bar */}
          <div className="w-full bg-[#061C0E] h-1.5 border border-[#12612F]/40 overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                audioLevel > 70 ? 'bg-red-500' : audioLevel > 40 ? 'bg-amber-400' : 'bg-[#4CFF8A]'
              }`}
              style={{ width: `${audioLevel}%` }}
            />
          </div>
        </div>

        {/* Real-time Extracted Telemetry & Calculated Asthma Chances */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="border border-[#12612F] bg-[#020A05] p-3 flex flex-col justify-between">
            <span className="text-[10px] text-[#2FBF63] uppercase">Detected Coughs</span>
            <div className="text-xl font-bold text-[#B6FFCC] mt-1">{detectedCoughs}</div>
            <span className="text-[10px] text-[#75FFA5] mt-0.5">Burst Events</span>
          </div>

          <div className="border border-[#12612F] bg-[#020A05] p-3 flex flex-col justify-between">
            <span className="text-[10px] text-[#2FBF63] uppercase">Cough Severity</span>
            <div
              className={`text-sm font-bold mt-1 ${
                detectedCoughSeverity === 3
                  ? 'text-red-400'
                  : detectedCoughSeverity === 2
                  ? 'text-amber-400'
                  : detectedCoughSeverity === 1
                  ? 'text-emerald-400'
                  : 'text-[#B6FFCC]'
              }`}
            >
              Grade {detectedCoughSeverity}/3
            </div>
            <span className="text-[10px] text-[#75FFA5] mt-0.5">
              {detectedCoughSeverity === 3
                ? 'Severe / Paroxysmal'
                : detectedCoughSeverity === 2
                ? 'Moderate Coughing'
                : detectedCoughSeverity === 1
                ? 'Mild / Occasional'
                : 'Quiet / Baseline'}
            </span>
          </div>

          <div className="border border-[#12612F] bg-[#020A05] p-3 flex flex-col justify-between">
            <span className="text-[10px] text-[#2FBF63] uppercase">Acoustic Wheeze</span>
            <div
              className={`text-sm font-bold mt-1 ${
                detectedWheeze ? 'text-amber-400 animate-pulse' : 'text-[#4CFF8A]'
              }`}
            >
              {detectedWheeze ? '⚠ WHEEZE DETECTED' : 'CLEAR'}
            </div>
            <span className="text-[10px] text-[#75FFA5] mt-0.5">400–1600 Hz Tonal</span>
          </div>

          <div className="border border-[#12612F] bg-[#020A05] p-3 flex flex-col justify-between">
            <span className="text-[10px] text-[#2FBF63] uppercase">Asthma Flare-Up Chances</span>
            <div
              className={`text-xl font-bold mt-1 ${
                (liveAsthmaChances || patient.risk48h) >= 60
                  ? 'text-red-400'
                  : (liveAsthmaChances || patient.risk48h) >= 35
                  ? 'text-amber-400'
                  : 'text-[#4CFF8A]'
              }`}
            >
              {(liveAsthmaChances || patient.risk48h).toFixed(1)}%
            </div>
            <span className="text-[10px] text-[#75FFA5] mt-0.5">
              {liveRiskLevel || patient.riskLevel} (48h Outlook)
            </span>
          </div>
        </div>

        {/* Action Controls & Sync */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[#12612F]/40">
          <div className="flex flex-wrap items-center gap-2">
            {!isMicActive ? (
              <button
                type="button"
                onClick={startMicrophoneMonitoring}
                className="px-4 py-2 border border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05] font-mono font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5"
              >
                <span>🎙️</span> Enable Microphone &amp; Start Listening
              </button>
            ) : (
              <button
                type="button"
                onClick={stopMicrophoneMonitoring}
                className="px-4 py-2 border border-red-500 bg-red-950/60 text-red-300 font-mono font-bold text-xs uppercase tracking-wider hover:bg-red-900 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>🛑</span> Stop Microphone
              </button>
            )}

            {isMicActive && (
              <button
                type="button"
                onClick={simulateDetectedCough}
                className="px-3 py-2 border border-[#12612F] bg-[#061C0E] text-[#B6FFCC] hover:text-[#4CFF8A] font-mono text-xs cursor-pointer transition-colors"
                title="Simulates an acoustic cough burst for testing"
              >
                + Trigger Test Cough Spike
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {acousticSyncMessage && (
              <span className="text-xs font-mono text-[#4CFF8A] animate-pulse">
                ✓ {acousticSyncMessage}
              </span>
            )}
            <button
              type="button"
              disabled={isSyncingAcoustic}
              onClick={handleManualSyncAcoustic}
              className="px-4 py-2 border border-[#12612F] bg-[#061C0E] text-[#4CFF8A] hover:border-[#4CFF8A] font-mono text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50 transition-all"
            >
              {isSyncingAcoustic ? 'Syncing...' : 'Sync Session to Digital Twin'}
            </button>
          </div>
        </div>

        {micPermission === 'denied' && (
          <div className="p-2.5 border border-red-800 bg-red-950/40 text-red-200 text-xs font-mono">
            ⚠ Microphone permission was blocked. Please enable microphone permissions in your browser address bar to monitor cough sounds.
          </div>
        )}
      </section>

      {/* =========================================================================
          5C. SMART WEBCAM FACIAL RESPIRATORY DISTRESS BIOSENSOR (LIVE CAMERA INGESTION)
      ========================================================================= */}
      <section
        aria-labelledby="camera-sensor-heading"
        className="border border-[#12612F] bg-[#04130A] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between border-b border-[#12612F]/60 pb-2.5 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isCameraActive ? 'bg-[#4CFF8A] animate-ping' : 'bg-[#12612F]'}`} />
              <h2 id="camera-sensor-heading" className="text-base font-bold text-[#B6FFCC] font-mono">
                Smart Webcam Facial Respiratory Distress Biosensor
              </h2>
            </div>
            <p className="text-xs text-[#75FFA5] mt-0.5">
              Live camera analysis tracking 468 3D landmarks via OpenCV/MediaPipe: Mouth Breathing, Nasal Flaring, Head Bobbing &amp; rPPG Heart Rate.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-mono uppercase px-2.5 py-1 border font-bold ${
                isCameraActive
                  ? isSimulatedCamera
                    ? 'border-cyan-400 bg-cyan-950/60 text-cyan-300'
                    : 'border-[#4CFF8A] bg-[#0E793C]/40 text-[#4CFF8A]'
                  : 'border-[#12612F] text-[#2FBF63] bg-[#020A05]'
              }`}
            >
              {isCameraActive
                ? isSimulatedCamera
                  ? '● SIMULATED BIOSENSOR ACTIVE'
                  : '● CAMERA ACTIVE'
                : '○ STANDBY'}
            </span>
          </div>
        </div>

        {/* Viewfinder and HUD */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-5 relative border border-[#12612F] bg-[#020A05] p-2 flex flex-col items-center justify-center min-h-[200px] overflow-hidden">
            {/* Real Hardware Webcam Feed */}
            <video
              ref={videoElementRef}
              playsInline
              muted
              autoPlay
              className={`w-full max-h-[190px] object-cover border border-[#12612F]/60 ${
                isCameraActive && !isSimulatedCamera ? 'block' : 'hidden'
              }`}
            />

            {/* Synthetic Animated Biosensor Canvas */}
            <canvas
              ref={simulatedCanvasRef}
              width={320}
              height={240}
              className={`w-full max-h-[190px] object-cover border border-[#12612F]/60 ${
                isCameraActive && isSimulatedCamera ? 'block' : 'hidden'
              }`}
            />

            {/* Hidden Offscreen Processing Canvas */}
            <canvas ref={videoCanvasRef} className="hidden" />

            {!isCameraActive && (
              <div className="text-center p-6 space-y-2">
                <div className="text-3xl">📹</div>
                <div className="text-xs font-mono text-[#75FFA5]">Camera Inactive</div>
                <p className="text-[11px] text-[#2FBF63] max-w-xs">
                  Enable hardware webcam or launch simulated biosensor to monitor accessory muscle strain, mouth breathing, and optical pulse.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={startSimulatedCameraMonitoring}
                    className="px-3 py-1 border border-cyan-400/80 bg-cyan-950/60 text-cyan-300 font-mono text-[11px] uppercase font-bold hover:bg-cyan-900 transition-colors cursor-pointer"
                  >
                    🎮 Quick Launch Simulator
                  </button>
                </div>
              </div>
            )}

            {isCameraActive && (
              <div className="absolute inset-2 pointer-events-none border border-[#4CFF8A]/30 flex flex-col justify-between p-2">
                <div className="flex justify-between text-[9px] font-mono text-[#4CFF8A] bg-[#020A05]/80 px-1.5 py-0.5">
                  <span>{isSimulatedCamera ? 'SIMULATION FEED • 30 FPS' : 'LIVE CAMERA • 30 FPS'}</span>
                  <span>IPD LOCK: ACTIVE</span>
                </div>
                <div className="flex justify-between text-[9px] font-mono text-[#4CFF8A] bg-[#020A05]/80 px-1.5 py-0.5">
                  <span>MAR: {(mouthAspectPct / 100).toFixed(2)}</span>
                  <span>rPPG: {opticalHeartRate.toFixed(0)} BPM</span>
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-7 flex flex-col justify-between space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
              <div className="border border-[#12612F] bg-[#020A05] p-2.5">
                <span className="text-[10px] text-[#2FBF63] uppercase block">Ventilation Mode</span>
                <span className={`text-xs font-bold mt-1 block ${mouthBreathingDetected ? 'text-amber-400' : 'text-[#4CFF8A]'}`}>
                  {mouthBreathingDetected ? '👄 Oral Breathing' : '👃 Nasal Breathing'}
                </span>
                <span className="text-[9px] text-[#75FFA5]">MAR: {(mouthAspectPct / 100).toFixed(2)}</span>
              </div>

              <div className="border border-[#12612F] bg-[#020A05] p-2.5">
                <span className="text-[10px] text-[#2FBF63] uppercase block">Nasal Flaring</span>
                <span className={`text-xs font-bold mt-1 block ${nasalFlaringDetected ? 'text-red-400' : 'text-[#4CFF8A]'}`}>
                  {nasalFlaringDetected ? '⚠ Dilated' : 'Normal'}
                </span>
                <span className="text-[9px] text-[#75FFA5]">Alar Index</span>
              </div>

              <div className="border border-[#12612F] bg-[#020A05] p-2.5">
                <span className="text-[10px] text-[#2FBF63] uppercase block">Accessory Muscles</span>
                <span className={`text-xs font-bold mt-1 block ${accessoryStrainDetected ? 'text-amber-400' : 'text-[#4CFF8A]'}`}>
                  {accessoryStrainDetected ? '⚠ Strain / Bobbing' : 'Relaxed'}
                </span>
                <span className="text-[9px] text-[#75FFA5]">Brow &amp; SCM</span>
              </div>

              <div className="border border-[#12612F] bg-[#020A05] p-2.5">
                <span className="text-[10px] text-[#2FBF63] uppercase block">Video Resp Rate</span>
                <span className="text-sm font-bold text-[#B6FFCC] mt-1 block">
                  {videoRespiratoryRate.toFixed(1)} <span className="text-[10px] font-normal text-[#2FBF63]">brpm</span>
                </span>
                <span className="text-[9px] text-[#75FFA5]">Nose Motion FFT</span>
              </div>

              <div className="border border-[#12612F] bg-[#020A05] p-2.5">
                <span className="text-[10px] text-[#2FBF63] uppercase block">Optical rPPG Pulse</span>
                <span className="text-sm font-bold text-[#B6FFCC] mt-1 block">
                  {opticalHeartRate.toFixed(0)} <span className="text-[10px] font-normal text-[#2FBF63]">bpm</span>
                </span>
                <span className="text-[9px] text-[#75FFA5]">Forehead Green Channel</span>
              </div>

              <div className="border border-[#12612F] bg-[#020A05] p-2.5">
                <span className="text-[10px] text-[#2FBF63] uppercase block">Distress Grade</span>
                <span className={`text-xs font-bold mt-1 block ${facialDistressGrade >= 2 ? 'text-red-400' : facialDistressGrade === 1 ? 'text-amber-400' : 'text-[#4CFF8A]'}`}>
                  Grade {facialDistressGrade}/3
                </span>
                <span className="text-[9px] text-[#75FFA5]">
                  {facialDistressGrade === 3 ? 'Severe Distress' : facialDistressGrade === 2 ? 'Moderate Strain' : facialDistressGrade === 1 ? 'Mild Tension' : 'Calm'}
                </span>
              </div>
            </div>

            {/* Slider to adjust mouth opening for calibration / simulation */}
            <div className="p-2 border border-[#12612F]/60 bg-[#020A05] text-xs font-mono space-y-1">
              <div className="flex justify-between text-[10px] text-[#2FBF63]">
                <span>ORAL CAVITY APERTURE (MAR): {mouthAspectPct}%</span>
                <span>{mouthAspectPct > 35 ? 'ORAL VENTILATION TRIGGERED' : 'NASAL RESTING'}</span>
              </div>
              <input
                type="range"
                min="5"
                max="85"
                value={mouthAspectPct}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMouthAspectPct(val);
                  setMouthBreathingDetected(val > 35);
                  if (val > 35) {
                    setFacialDistressGrade(Math.max(1, facialDistressGrade));
                  }
                }}
                className="w-full accent-[#4CFF8A] cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Action Controls & Sync */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[#12612F]/40">
          <div className="flex flex-wrap items-center gap-2">
            {!isCameraActive ? (
              <>
                <button
                  type="button"
                  onClick={startCameraMonitoring}
                  className="px-4 py-2 border border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05] font-mono font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5"
                >
                  <span>📷</span> Enable Camera &amp; Track Face
                </button>
                <button
                  type="button"
                  onClick={startSimulatedCameraMonitoring}
                  className="px-3 py-2 border border-cyan-400 bg-cyan-950/60 text-cyan-300 font-mono font-bold text-xs uppercase tracking-wider hover:bg-cyan-900 transition-colors cursor-pointer flex items-center gap-1.5"
                  title="Runs realistic facial telemetry simulation with no camera hardware or permissions required"
                >
                  <span>🎮</span> Simulate Webcam Feed
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={stopCameraMonitoring}
                  className="px-4 py-2 border border-red-500 bg-red-950/60 text-red-300 font-mono font-bold text-xs uppercase tracking-wider hover:bg-red-900 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>🛑</span> Stop Feed
                </button>
                {!isSimulatedCamera ? (
                  <button
                    type="button"
                    onClick={startSimulatedCameraMonitoring}
                    className="px-3 py-2 border border-cyan-500/60 bg-cyan-950/40 text-cyan-300 font-mono text-xs cursor-pointer hover:bg-cyan-900/60 transition-colors"
                  >
                    Switch to Simulator
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startCameraMonitoring}
                    className="px-3 py-2 border border-[#4CFF8A]/60 bg-[#061C0E] text-[#4CFF8A] font-mono text-xs cursor-pointer hover:bg-[#0E793C]/40 transition-colors"
                  >
                    Switch to Real Webcam
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={simulateMouthBreathingSpike}
              className="px-3 py-2 border border-[#12612F] bg-[#061C0E] text-[#B6FFCC] hover:text-[#4CFF8A] font-mono text-xs cursor-pointer transition-colors"
              title="Simulates rapid oral hyperventilation & nasal flaring for testing"
            >
              + Trigger Test Distress Spike
            </button>
          </div>

          <div className="flex items-center gap-2">
            {videoSyncMessage && (
              <span className="text-xs font-mono text-[#4CFF8A] animate-pulse">
                ✓ {videoSyncMessage}
              </span>
            )}
            <button
              type="button"
              disabled={isSyncingVideo}
              onClick={handleManualSyncVideo}
              className="px-4 py-2 border border-[#12612F] bg-[#061C0E] text-[#4CFF8A] hover:border-[#4CFF8A] font-mono text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50 transition-all"
            >
              {isSyncingVideo ? 'Syncing...' : 'Sync Session to Digital Twin'}
            </button>
          </div>
        </div>

        {/* Error / Permission Guidance Banner */}
        {cameraErrorMessage && (
          <div className="p-3 border border-amber-600/70 bg-amber-950/40 text-amber-200 text-xs font-mono space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-amber-400 font-bold text-base leading-none">⚠</span>
              <div className="flex-1 space-y-1">
                <p className="font-semibold text-amber-300">{cameraErrorMessage}</p>
                {cameraErrorType === 'permission_denied' && (
                  <div className="mt-2 p-2.5 bg-[#020A05]/90 border border-amber-500/30 text-[11px] text-[#B6FFCC] space-y-1.5">
                    <p className="font-bold text-[#4CFF8A]">How to enable camera in your browser:</p>
                    <ol className="list-decimal list-inside space-y-1 text-[#75FFA5]">
                      <li>
                        Look at your browser&apos;s address bar at the top (next to <code className="bg-[#04130A] px-1 py-0.5 border border-[#12612F] text-white">localhost:3000</code>).
                      </li>
                      <li>
                        Click the <strong>site settings / tune icon 🎛️</strong> or <strong>padlock 🔒</strong> icon.
                      </li>
                      <li>
                        Locate <strong>Camera</strong> in the permissions menu and change it from <em>Block</em> to <strong>Allow</strong>.
                      </li>
                      <li>
                        Click the <strong>Retry Real Camera</strong> button below.
                      </li>
                    </ol>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-700/40">
              <button
                type="button"
                onClick={startCameraMonitoring}
                className="px-3 py-1.5 border border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05] font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1"
              >
                <span>🔄</span> Retry Real Camera
              </button>
              <button
                type="button"
                onClick={startSimulatedCameraMonitoring}
                className="px-3 py-1.5 border border-cyan-400 bg-cyan-950/60 text-cyan-300 font-bold text-xs hover:bg-cyan-900 transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>🎮</span> Launch Simulated Biosensor Stream (No Permission Needed)
              </button>
            </div>
          </div>
        )}
      </section>

      {/* =========================================================================
          6. DAILY CHECK-IN AS A QUICK-TAP ROW
      ========================================================================= */}
      <section
        aria-labelledby="daily-checkin-heading"
        className="border border-[#12612F] bg-[#04130A] p-5 space-y-3"
      >
        <div className="flex items-center justify-between border-b border-[#12612F]/60 pb-2">
          <div>
            <h2 id="daily-checkin-heading" className="text-base font-bold text-[#B6FFCC]">
              Daily Check-In
            </h2>
            <p className="text-xs text-[#75FFA5]">Feeds your digital twin and clinical record.</p>
          </div>
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 border border-[#12612F] text-[#4CFF8A]">
            Quick Entry
          </span>
        </div>

        <form onSubmit={handleLogSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
            {/* Controller taken (tick) */}
            <div className="border border-[#12612F] bg-[#020A05] p-2.5 flex flex-col justify-between space-y-1">
              <span className="text-[10px] font-mono text-[#2FBF63] uppercase truncate">
                Controller Med
              </span>
              <button
                type="button"
                onClick={() => setControllerTaken(!controllerTaken)}
                className={`w-full py-1.5 px-2 border font-mono font-bold text-xs uppercase cursor-pointer transition-colors ${
                  controllerTaken
                    ? 'border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05]'
                    : 'border-[#12612F] text-[#2FBF63]'
                }`}
              >
                {controllerTaken ? '✓ Taken' : 'Not Yet'}
              </button>
            </div>

            {/* Rescue puffs (stepper) */}
            <div className="border border-[#12612F] bg-[#020A05] p-2.5 flex flex-col justify-between space-y-1">
              <span className="text-[10px] font-mono text-[#2FBF63] uppercase">Rescue Puffs</span>
              <div className="flex items-center justify-between font-mono">
                <button
                  type="button"
                  onClick={() => setRescuePuffs((p) => Math.max(0, p - 1))}
                  className="w-7 h-7 border border-[#12612F] bg-[#061C0E] text-[#4CFF8A] font-bold cursor-pointer"
                  aria-label="Decrease puffs"
                >
                  −
                </button>
                <span className="text-xs font-bold text-[#B6FFCC]">{rescuePuffs}</span>
                <button
                  type="button"
                  onClick={() => setRescuePuffs((p) => Math.min(20, p + 1))}
                  className="w-7 h-7 border border-[#12612F] bg-[#061C0E] text-[#4CFF8A] font-bold cursor-pointer"
                  aria-label="Increase puffs"
                >
                  +
                </button>
              </div>
            </div>

            {/* 4 Symptoms as compact 4-step selectors */}
            {[
              { label: 'Cough', val: coughScore, setter: setCoughScore },
              { label: 'Wheeze', val: wheezingScore, setter: setWheezingScore },
              { label: 'Tightness', val: tightnessScore, setter: setTightnessScore },
              { label: 'Breath', val: breathlessnessScore, setter: setBreathlessnessScore },
            ].map((sym) => (
              <div
                key={sym.label}
                className="border border-[#12612F] bg-[#020A05] p-2.5 flex flex-col justify-between space-y-1"
              >
                <span className="text-[10px] font-mono text-[#2FBF63] uppercase">{sym.label}</span>
                <div className="grid grid-cols-4 gap-0.5 font-mono text-[10px]">
                  {['0', '1', '2', '3'].map((lvl, idx) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => sym.setter(idx)}
                      className={`py-1 border cursor-pointer text-center ${
                        sym.val === idx
                          ? 'border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05] font-bold'
                          : 'border-[#12612F] text-[#2FBF63]'
                      }`}
                      title={idx === 0 ? 'None' : idx === 1 ? 'Mild' : idx === 2 ? 'Moderate' : 'Severe'}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Collapsible note input & Save button */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setShowNoteInput(!showNoteInput)}
                className="font-mono text-[#2FBF63] hover:text-[#B6FFCC] text-xs cursor-pointer"
              >
                {showNoteInput ? '− Hide note' : '+ Add optional note'}
              </button>
              {logSuccessMessage && (
                <span className="text-[#4CFF8A] font-mono">✓ {logSuccessMessage}</span>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmittingLog}
              className="px-5 py-2 border border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05] font-mono font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
            >
              {isSubmittingLog ? 'Saving...' : 'Save Check-In'}
            </button>
          </div>

          {showNoteInput && (
            <input
              type="text"
              placeholder="e.g. commute dust, woke up coughing..."
              value={logNotes}
              onChange={(e) => setLogNotes(e.target.value)}
              className="w-full bg-[#061C0E] border border-[#12612F] text-[#B6FFCC] px-3 py-1.5 text-xs font-mono"
            />
          )}

          {recentLogs.length > 0 && (
            <div className="text-[10px] font-mono text-[#2FBF63] pt-1.5 border-t border-[#12612F]/30 flex flex-wrap items-center justify-between gap-1">
              <span>
                Last log: {recentLogs[0].controller_taken ? 'Controller taken' : 'Missed'} •{' '}
                {recentLogs[0].rescue_puffs} {recentLogs[0].rescue_puffs === 1 ? 'puff' : 'puffs'}
              </span>
              <span>{recentLogs.length} total check-ins</span>
            </div>
          )}
        </form>
      </section>

      {/* =========================================================================
          7. COPILOT SUMMARY (UNTOUCHED PER INSTRUCTIONS)
          // 08 • PATIENT COPILOT REPORT
      ========================================================================= */}
      <section
        aria-labelledby="copilot-report-heading"
        className="border border-[#12612F] bg-[#04130A] p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#12612F]/60 pb-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#2FBF63]">
              {'◈ 08 • PATIENT COPILOT REPORT'}
            </div>
            <h2 id="copilot-report-heading" className="text-xl sm:text-2xl font-bold text-[#B6FFCC] mt-0.5">
              Personalized Copilot Health Summary
            </h2>
            <p className="text-xs text-[#75FFA5] mt-0.5">
              AI-assisted clinical draft grounded in your digital twin telemetry, air quality forecast, and personal baseline.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRefreshCopilotReport}
              disabled={isCopilotReportLoading}
              className="px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider font-semibold border border-[#12612F] bg-[#020A05] text-[#4CFF8A] hover:border-[#4CFF8A] hover:bg-[#061C0E] transition-colors cursor-pointer disabled:opacity-50"
            >
              {isCopilotReportLoading ? 'Updating Report...' : 'Refresh Copilot Report'}
            </button>
            <button
              type="button"
              onClick={() => setIsCopilotReportExpanded(!isCopilotReportExpanded)}
              className="text-xs font-mono text-[#2FBF63] hover:text-[#B6FFCC] cursor-pointer"
            >
              {isCopilotReportExpanded ? '[Collapse −]' : '[Expand +]'}
            </button>
          </div>
        </div>

        {isCopilotReportLoading && !copilotReport && (
          <div className="py-6 font-mono text-sm text-[#4CFF8A] flex items-center space-x-2">
            <span className="inline-block w-2.5 h-2.5 bg-[#4CFF8A] animate-pulse" />
            <span>Generating personalized copilot report from your twin signals...</span>
          </div>
        )}

        {copilotReportError && (
          <p role="alert" className="border border-[#FF2A1A]/60 bg-[#1B0806] p-3.5 text-xs text-[#FF9A8F]">
            {copilotReportError}
          </p>
        )}

        {copilotReport && isCopilotReportExpanded && (
          <div className="space-y-4 text-xs text-[#B6FFCC]">
            {/* Status & Risk Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 border border-[#12612F] bg-[#020A05] text-[11px] font-mono text-[#2FBF63] uppercase">
                CLINICAL STATUS: <strong className="text-[#4CFF8A]">{copilotReport.clinical_status}</strong>
              </span>
              <span
                className={`px-2.5 py-1 border text-[11px] font-mono font-bold uppercase ${
                  copilotReport.risk_level === 'High'
                    ? 'border-[#FF2A1A] bg-[#1B0806] text-[#FF9A8F]'
                    : copilotReport.risk_level === 'Medium'
                    ? 'border-[#FFE14A] bg-[#1F1B05] text-[#FFE14A]'
                    : 'border-[#4CFF8A] bg-[#04130A] text-[#4CFF8A]'
                }`}
              >
                RISK LEVEL: {copilotReport.risk_level}
              </span>
            </div>

            {/* Summary Reason */}
            <div className="border border-[#12612F] bg-[#020A05] p-4 space-y-1.5">
              <div className="text-[11px] font-mono uppercase text-[#2FBF63] font-semibold">
                Summary Reason &amp; Clinical Driver Breakdown
              </div>
              <p className="text-sm leading-relaxed text-[#B6FFCC]">
                {copilotReport.summary_reason}
              </p>
            </div>

            {/* Precautions and Recorded Triggers in responsive 2 cols */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="border border-[#12612F] bg-[#020A05] p-4 space-y-2">
                <div className="font-mono uppercase text-[#4CFF8A] font-semibold text-xs">
                  Key Precautions
                </div>
                <ul className="list-disc pl-4 space-y-1.5 text-xs text-[#75FFA5]">
                  {copilotReport.precautions.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="border border-[#12612F] bg-[#020A05] p-4 space-y-2">
                <div className="font-mono uppercase text-[#FFE14A] font-semibold text-xs">
                  Recorded Triggers To Avoid
                </div>
                <ul className="list-disc pl-4 space-y-1.5 text-xs text-[#75FFA5]">
                  {copilotReport.triggers_to_avoid.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Breathing Exercise if available */}
            {copilotReport.breathing_exercise && (
              <div className="border border-[#12612F] bg-[#020A05] p-4 space-y-2">
                <div className="font-mono uppercase text-[#4CFF8A] font-semibold text-xs">
                  Recommended Breathing Exercise: {copilotReport.breathing_exercise.name}
                </div>
                <p className="text-xs text-[#75FFA5]">{copilotReport.breathing_exercise.purpose}</p>
                <ul className="list-disc pl-4 space-y-1 text-xs text-[#B6FFCC]">
                  {copilotReport.breathing_exercise.how_to_do_it.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
                <div className="text-[11px] font-mono text-[#2FBF63]">
                  Duration: {copilotReport.breathing_exercise.duration}
                </div>
              </div>
            )}

            {/* Medication guidance note */}
            <div className="border-t border-[#12612F]/60 pt-3 text-xs text-[#2FBF63]">
              <strong className="text-[#4CFF8A] uppercase font-mono">Medication Note:</strong>{' '}
              <span className="text-[#B6FFCC]">
                {copilotReport.medication_guidance.action} {copilotReport.medication_guidance.note}
              </span>
            </div>

            {/* Emergency warning note */}
            {copilotReport.emergency_warning && (
              <div className="border border-[#FF2A1A]/40 bg-[#160605] p-3 text-xs text-[#FFA49C]">
                <strong className="text-[#FF2A1A] font-mono uppercase">Emergency Warning:</strong>{' '}
                {copilotReport.emergency_warning}
              </div>
            )}
          </div>
        )}
      </section>

      {/* =========================================================================
          8. CARE PLAN AND CONTACT: ONE COMPACT CARD
      ========================================================================= */}
      <section
        id="care-plan-section"
        aria-labelledby="care-plan-heading"
        className="border border-[#12612F] bg-[#04130A] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/60 pb-2">
          <h2 id="care-plan-heading" className="text-base font-bold text-[#B6FFCC]">
            Care Plan &amp; Clinic Contact
          </h2>
          <span className="text-xs font-mono text-[#4CFF8A]">
            Dr. Vikram Mehta, MD (Pulmonology)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {/* Action Plan */}
          <div className="border border-[#12612F] bg-[#020A05] p-3.5 space-y-1.5">
            <div className="text-[10px] font-mono uppercase text-[#2FBF63] font-bold">
              Current Plan
            </div>
            <div className="text-sm font-bold text-[#B6FFCC]">
              {patient.controllerMedication}
            </div>
            <div className="text-xs text-[#75FFA5]">
              Rescue: {patient.rescueMedication}
            </div>
            <div className="text-[11px] text-[#2FBF63] pt-1 border-t border-[#12612F]/40 truncate">
              Triggers: {patient.allergens.join(', ')}
            </div>
          </div>

          {/* Next Visit */}
          <div className="border border-[#12612F] bg-[#020A05] p-3.5 space-y-1.5">
            <div className="text-[10px] font-mono uppercase text-[#2FBF63] font-bold">
              Next Clinic Visit
            </div>
            <div className="text-sm font-bold text-[#B6FFCC] font-mono">
              Tue, Oct 27, 2026 • 10:30 AM
            </div>
            <div className="text-xs text-[#75FFA5]">
              Pulmonology Outpatient Clinic ({patient.city})
            </div>
            <div className="text-[11px] text-[#4CFF8A] pt-1 border-t border-[#12612F]/40 font-mono">
              ✓ Daily logs shared with physician
            </div>
          </div>

          {/* Clinic Contact */}
          <div className="border border-[#12612F] bg-[#020A05] p-3.5 space-y-2 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase text-[#2FBF63] font-bold">
                Clinic Line
              </div>
              <div className="text-sm font-bold text-[#B6FFCC]">
                BreathTwin Pulmonology Desk
              </div>
              <div className="text-xs text-[#75FFA5] font-mono">
                +91 11-2658-8821 (9 AM – 5 PM)
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <a
                href="tel:+911126588821"
                className="flex-1 py-1.5 border border-[#4CFF8A] text-[#4CFF8A] hover:bg-[#4CFF8A] hover:text-[#020A05] font-mono font-bold text-center uppercase text-[11px] transition-colors"
              >
                Call Clinic
              </a>
              <a
                href="#urgent-help-bar"
                className="py-1.5 px-3 border border-[#12612F] text-[#75FFA5] hover:text-[#B6FFCC] font-mono text-center uppercase text-[11px] transition-colors"
              >
                Emergency ↑
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function PatientPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-mono text-[#4CFF8A] border border-[#12612F] bg-[#04130A]">
          &gt; INITIALIZING PATIENT PORTAL OUTLOOK...
        </div>
      }
    >
      <PatientPortalContent />
    </Suspense>
  );
}
