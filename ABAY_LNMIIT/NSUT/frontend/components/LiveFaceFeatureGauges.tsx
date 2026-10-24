import styles from './LiveFaceFeatureGauges.module.css';

export interface FaceFeatures {
  mouth_breathing_ratio: number;
  nasal_flaring_index: number;
  brow_strain_score: number;
  head_bobbing_amplitude: number;
  video_respiratory_rate: number;
  yawn_sigh_count: number;
  blink_rate_bpm: number;
  forehead_rppg_heart_rate: number;
  jaw_slack_index: number;
  gaze_instability_score: number;
}

interface LiveFaceFeatureGaugesProps {
  features: FaceFeatures | null;
  quality?: number;
}

const GAUGES: { key: keyof FaceFeatures; label: string; scale?: number; unit?: string }[] = [
  { key: 'mouth_breathing_ratio', label: 'Mouth breathing' },
  { key: 'nasal_flaring_index', label: 'Nasal flaring' },
  { key: 'brow_strain_score', label: 'Brow strain' },
  { key: 'head_bobbing_amplitude', label: 'Head bobbing' },
  { key: 'video_respiratory_rate', label: 'Video respiratory rate', scale: 40, unit: 'brpm' },
  { key: 'yawn_sigh_count', label: 'Yawn / sigh count', scale: 10, unit: 'events' },
  { key: 'blink_rate_bpm', label: 'Blink rate', scale: 40, unit: 'bpm' },
  { key: 'forehead_rppg_heart_rate', label: 'Forehead heart rate', scale: 140, unit: 'bpm' },
  { key: 'jaw_slack_index', label: 'Jaw slack' },
  { key: 'gaze_instability_score', label: 'Gaze instability' },
];

function levelClass(value: number) {
  if (value >= 0.7) return styles.high;
  if (value >= 0.3) return styles.medium;
  return styles.low;
}

export default function LiveFaceFeatureGauges({ features, quality = 0 }: LiveFaceFeatureGaugesProps) {
  return (
    <section className={styles.card} aria-label="Live face feature gauges">
      <header className={styles.header}>
        <h2 className={styles.title}>Face feature indicators</h2>
        <span className={styles.quality}>Quality {Math.round(quality * 100)}%</span>
      </header>
      <div className={styles.grid}>
        {GAUGES.map(({ key, label, scale = 1, unit = '' }) => {
          const value = features?.[key] ?? 0;
          const fraction = Math.max(0, Math.min(1, value / scale));
          const colorClass = levelClass(fraction);
          return (
            <div className={styles.gauge} key={key}>
              <div className={styles.gaugeHeader}>
                <span>{label}</span>
                <strong className={colorClass}>
                  {Number(value).toFixed(key === 'yawn_sigh_count' ? 0 : 1)} {unit}
                </strong>
              </div>
              <div
                className={styles.track}
                role="meter"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={scale}
                aria-valuenow={value}
              >
                <span className={`${styles.fill} ${colorClass}`} style={{ width: `${fraction * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {!features && <p className={styles.hint}>Start the camera viewer to populate these values.</p>}
    </section>
  );
}
