'use client';

import React, { useState } from 'react';
import FaceFeaturesDashboard from '@/components/FaceFeaturesDashboard';
import MicFeaturesDashboard from '@/components/MicFeaturesDashboard';
import { FaceFeatures, MicFeatures, PredictV2Response, predictPatientV2 } from '@/lib/api';

export interface MultimodalEdgeSensorsProps {
  patientId: string;
  currentTelemetry?: {
    rhr?: number;
    rr?: number;
    spo2?: number;
    hrv?: number;
    pm25?: number;
    rescuePuffs24h?: number;
  } | null;
}

export default function MultimodalEdgeSensors({ patientId, currentTelemetry }: MultimodalEdgeSensorsProps) {
  const [liveFace, setLiveFace] = useState<FaceFeatures | null>(null);
  const [liveMic, setLiveMic] = useState<MicFeatures | null>(null);
  const [v2Prediction, setV2Prediction] = useState<PredictV2Response | null>(null);
  const [isPredictingV2, setIsPredictingV2] = useState<boolean>(false);

  const handleRunV2Prediction = async () => {
    setIsPredictingV2(true);
    try {
      const wearable_telemetry = currentTelemetry
        ? {
            heart_rate: currentTelemetry.rhr,
            respiratory_rate: currentTelemetry.rr,
            spo2: currentTelemetry.spo2,
            hrv: currentTelemetry.hrv,
            pm25: currentTelemetry.pm25,
          }
        : undefined;

      const pred = await predictPatientV2(patientId, {
        face_features: liveFace || undefined,
        mic_features: liveMic || undefined,
        wearable_telemetry,
      });
      setV2Prediction(pred);
    } catch (err) {
      console.error('v2 inference failed:', err);
    } finally {
      setIsPredictingV2(false);
    }
  };

  return (
    <div className="space-y-6 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#B4E3C5] dark:border-[#12612F] pb-3">
        <div>
          <h2 className="text-xl font-bold text-[#0E793C] dark:text-[#B6FFCC] tracking-wide">
            {`◈ Real-Time Multimodal Edge Sensors (Face Video & Voice Mic)`}
          </h2>
          <div className="text-xs text-[#4A755A] dark:text-[#2FBF63] mt-0.5">
            Live webcam facial landmark tracking (10 channels) + microphone acoustic DSP (4 channels) feeding RespiTwin v2 frozen inference.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRunV2Prediction}
            disabled={isPredictingV2}
            className="px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-wider border border-[#0E793C] dark:border-[#4CFF8A] bg-[#0E793C] dark:bg-[#4CFF8A]/20 text-white dark:text-[#4CFF8A] hover:bg-[#0A602F] dark:hover:bg-[#4CFF8A] dark:hover:text-[#020A05] transition-all cursor-pointer flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
          >
            <span>{isPredictingV2 ? 'EVALUATING v2...' : '⚡ RUN v2 FROZEN INFERENCE'}</span>
          </button>
        </div>
      </div>

      {/* Live Face and Mic Dashboards */}
      <div className="space-y-4">
        <FaceFeaturesDashboard patientId={patientId} onFeaturesUpdate={setLiveFace} />
        <MicFeaturesDashboard patientId={patientId} onFeaturesUpdate={setLiveMic} />
      </div>

      {/* Latest Predictions Panel */}
      <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-4 text-xs font-mono space-y-3.5 shadow-sm dark:shadow-none transition-colors">
        <div className="flex flex-wrap items-center justify-between border-b border-[#B4E3C5]/60 dark:border-[#12612F]/40 pb-2">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#0E793C] dark:text-[#B6FFCC]">
              ◈ LATEST v2 MULTIMODAL PREDICTIONS (FROZEN FORWARD-PASS)
            </span>
            <span className="text-[10px] px-1.5 py-0.5 border border-[#B4E3C5] dark:border-[#12612F] text-[#0A602F] dark:text-[#2FBF63] bg-[#EAF8EF] dark:bg-[#061C0E]">
              {v2Prediction ? v2Prediction.model_version : 'v2.0.0-frozen'}
            </span>
          </div>
          <div className="flex items-center space-x-3 text-[10px] text-[#4A755A] dark:text-[#2FBF63]">
            <span>MODALITIES:</span>
            <span className={liveFace ? 'text-[#0E793C] dark:text-[#4CFF8A] font-bold' : 'text-gray-400'}>
              {liveFace ? 'FACE ✓' : 'FACE (HEURISTIC)'}
            </span>
            <span className={liveMic ? 'text-[#0E793C] dark:text-[#4CFF8A] font-bold' : 'text-gray-400'}>
              {liveMic ? 'MIC ✓' : 'MIC (HEURISTIC)'}
            </span>
            <span className="text-[#0E793C] dark:text-[#4CFF8A] font-bold">WEARABLE ✓</span>
          </div>
        </div>

        {v2Prediction ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {/* 24h Risk */}
            <div className="p-3 border border-[#B4E3C5]/50 dark:border-[#12612F]/40 bg-[#F6FBF7] dark:bg-[#061C0E]">
              <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63] uppercase">24H EXACERBATION RISK</div>
              <div
                className={`text-2xl font-bold font-mono mt-0.5 ${
                  v2Prediction.p24_risk >= 70
                    ? 'text-[#DC2626] dark:text-[#FF2A1A]'
                    : v2Prediction.p24_risk >= 45
                    ? 'text-[#D97706] dark:text-[#FFE14A]'
                    : 'text-[#0E793C] dark:text-[#4CFF8A]'
                }`}
              >
                {v2Prediction.p24_risk.toFixed(1)}%
              </div>
              <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] mt-1">
                TCN: {v2Prediction.base_predictions?.tcn_risk_24h ?? '--'}% | XGB:{' '}
                {v2Prediction.base_predictions?.xgboost_risk_24h ?? '--'}%
              </div>
            </div>

            {/* 48h Risk */}
            <div className="p-3 border border-[#B4E3C5]/50 dark:border-[#12612F]/40 bg-[#F6FBF7] dark:bg-[#061C0E]">
              <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63] uppercase">48H HORIZON RISK</div>
              <div
                className={`text-2xl font-bold font-mono mt-0.5 ${
                  v2Prediction.p48_risk >= 70
                    ? 'text-[#DC2626] dark:text-[#FF2A1A]'
                    : v2Prediction.p48_risk >= 45
                    ? 'text-[#D97706] dark:text-[#FFE14A]'
                    : 'text-[#0E793C] dark:text-[#4CFF8A]'
                }`}
              >
                {v2Prediction.p48_risk.toFixed(1)}%
              </div>
              <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] mt-1">
                TCN: {v2Prediction.base_predictions?.tcn_risk_48h ?? '--'}% | XGB:{' '}
                {v2Prediction.base_predictions?.xgboost_risk_48h ?? '--'}%
              </div>
            </div>

            {/* Severity Grade */}
            <div className="p-3 border border-[#B4E3C5]/50 dark:border-[#12612F]/40 bg-[#F6FBF7] dark:bg-[#061C0E]">
              <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63] uppercase">SEVERITY TIER</div>
              <div className="text-sm font-bold mt-1 text-[#0E793C] dark:text-[#B6FFCC]">
                GRADE {v2Prediction.severity_grade}
              </div>
              <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63] truncate mt-0.5">
                {v2Prediction.severity_label}
              </div>
            </div>

            {/* Calibration / Timestamp */}
            <div className="p-3 border border-[#B4E3C5]/50 dark:border-[#12612F]/40 bg-[#F6FBF7] dark:bg-[#061C0E]">
              <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63] uppercase">CALIBRATION & CONFIDENCE</div>
              <div className="text-base font-bold font-mono mt-1 text-[#0E793C] dark:text-[#4CFF8A]">
                {(v2Prediction.confidence * 100).toFixed(1)}%
              </div>
              <div className="text-[9px] text-gray-500 mt-0.5">
                Synced: {new Date(v2Prediction.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 border border-dashed border-[#B4E3C5]/60 dark:border-[#12612F]/50 text-center text-[#4A755A] dark:text-[#2FBF63]">
            Click <span className="font-bold text-[#0E793C] dark:text-[#4CFF8A]">[⚡ RUN v2 FROZEN INFERENCE]</span> to
            evaluate multimodal predictions with real-time face & mic stream or heuristic fallback.
          </div>
        )}
      </div>
    </div>
  );
}
