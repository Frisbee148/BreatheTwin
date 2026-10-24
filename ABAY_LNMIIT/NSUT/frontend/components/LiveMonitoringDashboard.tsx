'use client';

import { useCallback, useState } from 'react';
import LiveAudioVisualizerViewer from './LiveAudioVisualizerViewer';
import LiveFaceFeatureGauges, { type FaceFeatures } from './LiveFaceFeatureGauges';
import LiveFaceKeypointsViewer from './LiveFaceKeypointsViewer';
import LiveVoiceFeatureIndicators, { type VoiceFeatures } from './LiveVoiceFeatureIndicators';
import styles from './LiveMonitoringDashboard.module.css';

interface LiveMonitoringDashboardProps {
  patientId: string;
}

export default function LiveMonitoringDashboard({ patientId }: LiveMonitoringDashboardProps) {
  const [faceFeatures, setFaceFeatures] = useState<FaceFeatures | null>(null);
  const [faceQuality, setFaceQuality] = useState(0);
  const [voiceFeatures, setVoiceFeatures] = useState<VoiceFeatures | null>(null);
  const [voiceQuality, setVoiceQuality] = useState(0);
  const handleFaceResult = useCallback((result: { quality: number }) => {
    setFaceQuality(result.quality);
  }, []);
  const handleVoiceResult = useCallback((result: { quality: number }) => {
    setVoiceQuality(result.quality);
  }, []);

  return (
    <div className={styles.dashboard}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Standalone sensor demo</p>
        <h1>Live multimodal monitoring</h1>
        <p>Camera and microphone are opt-in. Each stream can be started or stopped independently.</p>
      </header>
      <div className={styles.columns}>
        <div className={styles.column}>
          <LiveFaceKeypointsViewer
            patientId={patientId}
            onFeaturesUpdate={setFaceFeatures}
            onResult={handleFaceResult}
          />
          <LiveFaceFeatureGauges features={faceFeatures} quality={faceQuality} />
        </div>
        <div className={styles.column}>
          <LiveAudioVisualizerViewer
            patientId={patientId}
            onFeaturesUpdate={setVoiceFeatures}
            onResult={handleVoiceResult}
          />
          <LiveVoiceFeatureIndicators features={voiceFeatures} quality={voiceQuality} />
        </div>
      </div>
    </div>
  );
}
