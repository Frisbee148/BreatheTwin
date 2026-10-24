'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getPatientAcousticTelemetry,
  getPatientVisualTelemetry,
  AcousticTelemetryRecord,
  VisualTelemetryRecord,
} from '@/lib/api';

interface PatientRemoteBiosensorsCardProps {
  patientId: string;
}

export default function PatientRemoteBiosensorsCard({ patientId }: PatientRemoteBiosensorsCardProps) {
  const [latestVisual, setLatestVisual] = useState<VisualTelemetryRecord | null>(null);
  const [latestAcoustic, setLatestAcoustic] = useState<AcousticTelemetryRecord | null>(null);
  const [visualHistory, setVisualHistory] = useState<VisualTelemetryRecord[]>([]);
  const [acousticHistory, setAcousticHistory] = useState<AcousticTelemetryRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');

  const fetchTelemetry = useCallback(async () => {
    try {
      const [visRes, acRes] = await Promise.all([
        getPatientVisualTelemetry(patientId, 10),
        getPatientAcousticTelemetry(patientId, 10),
      ]);

      if (visRes && visRes.latest) {
        setLatestVisual(visRes.latest);
        setVisualHistory(visRes.history || []);
      } else {
        setLatestVisual(null);
        setVisualHistory([]);
      }

      if (acRes && acRes.latest) {
        setLatestAcoustic(acRes.latest);
        setAcousticHistory(acRes.history || []);
      } else {
        setLatestAcoustic(null);
        setAcousticHistory([]);
      }

      setLastRefreshed(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.warn('Failed to fetch patient remote telemetry:', err);
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry]);

  // Periodic polling for auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchTelemetry();
    }, 12000); // Poll every 12s
    return () => clearInterval(interval);
  }, [autoRefresh, fetchTelemetry]);

  const hasData = latestVisual !== null || latestAcoustic !== null;
  const isStridorAlert = (latestAcoustic?.stridor_detection_index ?? 0) > 0.35;
  const isDistressAlert = (latestVisual?.mouth_breathing_ratio ?? 0) > 0.4 || (latestVisual?.nasal_flaring_index ?? 0) > 0.45;

  return (
    <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-4 text-xs font-mono space-y-4 shadow-sm dark:shadow-none transition-colors">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#B4E3C5]/60 dark:border-[#12612F]/40 pb-2.5">
        <div className="flex items-center space-x-2">
          <span className={`w-2.5 h-2.5 rounded-full ${hasData ? 'bg-[#0E793C] dark:bg-[#4CFF8A] animate-pulse' : 'bg-gray-400'}`} />
          <span className="font-bold text-[#0E2E1B] dark:text-[#B6FFCC] text-xs uppercase tracking-wider">
            ◈ Remote Patient Biosensors & Edge Telemetry (Home Ingestion)
          </span>
          <span className="text-[10px] px-2 py-0.5 border border-[#B4E3C5] dark:border-[#12612F] text-[#0A602F] dark:text-[#2FBF63] bg-[#EAF8EF] dark:bg-[#061C0E]">
            {hasData ? 'FEED ACTIVE' : 'NO SESSIONS RECORDED'}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">
              UPDATED {lastRefreshed}
            </span>
          )}

          <button
            type="button"
            onClick={() => setAutoRefresh(prev => !prev)}
            title="Toggle automatic live polling"
            className={`px-2 py-0.5 text-[10px] border cursor-pointer ${
              autoRefresh
                ? 'border-[#0E793C] dark:border-[#4CFF8A] bg-[#EAF8EF] dark:bg-[#061C0E] text-[#0E793C] dark:text-[#4CFF8A] font-bold'
                : 'border-gray-300 dark:border-gray-700 text-gray-500'
            }`}
          >
            {autoRefresh ? '● AUTO-SYNC ON' : '○ AUTO-SYNC OFF'}
          </button>

          <button
            type="button"
            onClick={fetchTelemetry}
            disabled={isLoading}
            className="px-2.5 py-1 text-[11px] font-bold border border-[#0E793C] dark:border-[#4CFF8A] bg-[#0E793C] dark:bg-[#4CFF8A]/15 text-white dark:text-[#4CFF8A] hover:bg-[#0A602F] cursor-pointer disabled:opacity-50"
          >
            {isLoading ? 'SYNCING...' : '↻ REFRESH'}
          </button>

          <div className="flex border border-[#B4E3C5] dark:border-[#12612F] text-[10px]">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-2 py-0.5 cursor-pointer ${activeTab === 'overview' ? 'bg-[#0E793C] text-white' : 'text-[#4A755A] dark:text-[#2FBF63]'}`}
            >
              OVERVIEW
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-2 py-0.5 cursor-pointer ${activeTab === 'history' ? 'bg-[#0E793C] text-white' : 'text-[#4A755A] dark:text-[#2FBF63]'}`}
            >
              LOGS ({visualHistory.length + acousticHistory.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {activeTab === 'overview' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Card 1: Visual Biomarkers */}
          <div className="p-3 border border-[#B4E3C5]/60 dark:border-[#12612F]/50 bg-[#F6FBF7] dark:bg-[#061C0E] space-y-2">
            <div className="flex items-center justify-between border-b border-[#B4E3C5]/40 dark:border-[#12612F]/40 pb-1.5">
              <span className="font-bold text-[#0E793C] dark:text-[#B6FFCC] text-[11px] uppercase">
                ◈ Facial Respiratory CV
              </span>
              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                isDistressAlert
                  ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                  : 'bg-green-500/20 text-green-700 dark:text-green-300'
              }`}>
                {isDistressAlert ? 'DISTRESS ELEVATED' : 'STABLE'}
              </span>
            </div>

            {latestVisual ? (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-[#4A755A] dark:text-[#2FBF63]">Mouth Breathing:</span>
                  <span className="font-bold text-[#0E2E1B] dark:text-[#B6FFCC]">
                    {(latestVisual.mouth_breathing_ratio * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#4A755A] dark:text-[#2FBF63]">Alar / Nasal Flaring:</span>
                  <span className="font-bold text-[#0E2E1B] dark:text-[#B6FFCC]">
                    {(latestVisual.nasal_flaring_index * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#4A755A] dark:text-[#2FBF63]">Video Resp. Rate:</span>
                  <span className="font-bold text-[#0E2E1B] dark:text-[#B6FFCC]">
                    {latestVisual.video_respiratory_rate?.toFixed(1) || '--'} brpm
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#4A755A] dark:text-[#2FBF63]">Forehead rPPG HR:</span>
                  <span className="font-bold text-[#0E2E1B] dark:text-[#B6FFCC]">
                    {latestVisual.forehead_rppg_heart_rate?.toFixed(0) || '--'} bpm
                  </span>
                </div>
                <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] pt-1 border-t border-[#B4E3C5]/30">
                  Source: {latestVisual.source || 'Web Camera'} | {latestVisual.recorded_at ? new Date(latestVisual.recorded_at).toLocaleTimeString() : 'Recent'}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-gray-400 text-[11px]">
                No facial biomarker sessions received yet.
              </div>
            )}
          </div>

          {/* Card 2: Acoustic Biomarkers */}
          <div className="p-3 border border-[#B4E3C5]/60 dark:border-[#12612F]/50 bg-[#F6FBF7] dark:bg-[#061C0E] space-y-2">
            <div className="flex items-center justify-between border-b border-[#B4E3C5]/40 dark:border-[#12612F]/40 pb-1.5">
              <span className="font-bold text-[#0E793C] dark:text-[#B6FFCC] text-[11px] uppercase">
                ◈ Voice & Cough Acoustic DSP
              </span>
              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                isStridorAlert
                  ? 'bg-red-500/20 text-red-600 dark:text-red-400 animate-pulse'
                  : 'bg-green-500/20 text-green-700 dark:text-green-300'
              }`}>
                {isStridorAlert ? 'STRIDOR DETECTED' : 'AIRWAY CLEAR'}
              </span>
            </div>

            {latestAcoustic ? (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-[#4A755A] dark:text-[#2FBF63]">Stridor Index:</span>
                  <span className={`font-bold ${isStridorAlert ? 'text-red-600 dark:text-red-400' : 'text-[#0E2E1B] dark:text-[#B6FFCC]'}`}>
                    {latestAcoustic.stridor_detection_index.toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#4A755A] dark:text-[#2FBF63]">Hourly Coughs:</span>
                  <span className="font-bold text-[#0E2E1B] dark:text-[#B6FFCC]">
                    {latestAcoustic.hourly_cough_count} / hr
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#4A755A] dark:text-[#2FBF63]">Wheeze Duration:</span>
                  <span className="font-bold text-[#0E2E1B] dark:text-[#B6FFCC]">
                    {latestAcoustic.wheeze_percent_duration.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#4A755A] dark:text-[#2FBF63]">Vocal Jitter:</span>
                  <span className="font-bold text-[#0E2E1B] dark:text-[#B6FFCC]">
                    {latestAcoustic.vocal_hoarseness_jitter?.toFixed(2) || '--'}%
                  </span>
                </div>
                <div className="text-[9px] text-[#4A755A] dark:text-[#2FBF63] pt-1 border-t border-[#B4E3C5]/30">
                  Source: {latestAcoustic.source || 'Web Microphone'} | {latestAcoustic.recorded_at ? new Date(latestAcoustic.recorded_at).toLocaleTimeString() : 'Recent'}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-gray-400 text-[11px]">
                No acoustic sessions received yet.
              </div>
            )}
          </div>

          {/* Card 3: Clinical Routing & Outlier Link */}
          <div className="p-3 border border-[#B4E3C5]/60 dark:border-[#12612F]/50 bg-[#F6FBF7] dark:bg-[#061C0E] space-y-2 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-[#B4E3C5]/40 dark:border-[#12612F]/40 pb-1.5">
                <span className="font-bold text-[#0E793C] dark:text-[#B6FFCC] text-[11px] uppercase">
                  ◈ Clinician Actions
                </span>
                <span className="text-[9px] px-1.5 py-0.2 border border-[#B4E3C5] dark:border-[#12612F] text-[#0A602F] dark:text-[#2FBF63]">
                  REMOTE SYNC
                </span>
              </div>
              <p className="text-[10px] text-[#4A755A] dark:text-[#2FBF63] leading-relaxed">
                Biomarkers are collected on the patient&apos;s home device and streamed here. To simulate disease shifts or adapt twin weights based on these observations:
              </p>
            </div>

            <div className="space-y-1.5 pt-2">
              <Link
                href={`/patients/${encodeURIComponent(patientId)}/adapt`}
                className="block w-full py-1.5 text-center font-bold text-[11px] border border-[#0E793C] dark:border-[#4CFF8A] bg-[#0E793C] text-white hover:bg-[#0A602F] transition-all"
              >
                ➔ OPEN CLINICAL ADAPTATION & OUTLIER VIEW
              </Link>
              <div className="text-[9px] text-gray-400 text-center">
                Review complete 24-entry biomarker telemetry timeline
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* History Logs Table */
        <div className="overflow-x-auto border border-[#B4E3C5]/50 dark:border-[#12612F]/40">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-[#EAF8EF] dark:bg-[#061C0E] text-[#0E793C] dark:text-[#B6FFCC] uppercase border-b border-[#B4E3C5]/60">
              <tr>
                <th className="p-2">Type</th>
                <th className="p-2">Recorded At</th>
                <th className="p-2">Key Metric</th>
                <th className="p-2">Secondary Metric</th>
                <th className="p-2">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#B4E3C5]/30">
              {visualHistory.map((v, i) => (
                <tr key={`vis-${i}`} className="hover:bg-black/5 dark:hover:bg-white/5">
                  <td className="p-2 text-[#0E793C] dark:text-[#4CFF8A] font-bold">Face CV</td>
                  <td className="p-2 text-gray-600 dark:text-gray-300">
                    {v.recorded_at ? new Date(v.recorded_at).toLocaleTimeString() : 'Recent'}
                  </td>
                  <td className="p-2">
                    Mouth Breath: {(v.mouth_breathing_ratio * 100).toFixed(0)}%
                  </td>
                  <td className="p-2">
                    Nasal Flare: {(v.nasal_flaring_index * 100).toFixed(0)}%
                  </td>
                  <td className="p-2 text-gray-500">{v.source || 'Web Camera'}</td>
                </tr>
              ))}
              {acousticHistory.map((a, i) => (
                <tr key={`ac-${i}`} className="hover:bg-black/5 dark:hover:bg-white/5">
                  <td className="p-2 text-[#0E793C] dark:text-[#4CFF8A] font-bold">Voice Mic</td>
                  <td className="p-2 text-gray-600 dark:text-gray-300">
                    {a.recorded_at ? new Date(a.recorded_at).toLocaleTimeString() : 'Recent'}
                  </td>
                  <td className="p-2">
                    Stridor Index: {a.stridor_detection_index.toFixed(3)}
                  </td>
                  <td className="p-2">
                    Cough Count: {a.hourly_cough_count}/hr
                  </td>
                  <td className="p-2 text-gray-500">{a.source || 'Web Mic'}</td>
                </tr>
              ))}
              {visualHistory.length === 0 && acousticHistory.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-400">
                    No remote telemetry records found for this patient.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
