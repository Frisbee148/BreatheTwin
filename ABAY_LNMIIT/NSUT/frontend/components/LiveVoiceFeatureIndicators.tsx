import styles from './LiveVoiceFeatureIndicators.module.css';

export interface VoiceFeatures {
  stridor_detection_index: number;
  snoring_nocturnal_score: number;
  vocal_hoarseness_jitter: number;
  speech_rate_wpm: number;
}

interface LiveVoiceFeatureIndicatorsProps {
  features: VoiceFeatures | null;
  quality?: number;
}

const INDICATORS: { key: keyof VoiceFeatures; label: string; scale: number; unit: string }[] = [
  { key: 'stridor_detection_index', label: 'Stridor detection', scale: 1, unit: '' },
  { key: 'snoring_nocturnal_score', label: 'Snoring score', scale: 1, unit: '' },
  { key: 'vocal_hoarseness_jitter', label: 'Vocal hoarseness / jitter', scale: 8, unit: '%' },
  { key: 'speech_rate_wpm', label: 'Speech rate', scale: 220, unit: 'wpm' },
];

function levelClass(fraction: number) {
  if (fraction >= 0.6) return styles.high;
  if (fraction >= 0.3) return styles.medium;
  return styles.low;
}

export default function LiveVoiceFeatureIndicators({
  features,
  quality = 0,
}: LiveVoiceFeatureIndicatorsProps) {
  return (
    <section className={styles.card} aria-label="Live voice feature indicators">
      <header className={styles.header}>
        <h2 className={styles.title}>Voice feature indicators</h2>
        <span className={styles.quality}>Quality {Math.round(quality * 100)}%</span>
      </header>
      <div className={styles.grid}>
        {INDICATORS.map(({ key, label, scale, unit }) => {
          const value = features?.[key] ?? 0;
          const fraction = Math.max(0, Math.min(1, value / scale));
          const colorClass = levelClass(fraction);
          return (
            <div className={styles.indicator} key={key}>
              <div className={styles.indicatorHeader}>
                <span>{label}</span>
                <strong className={colorClass}>{Number(value).toFixed(2)} {unit}</strong>
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
      {!features && <p className={styles.hint}>Start the microphone viewer to populate these values.</p>}
    </section>
  );
}
