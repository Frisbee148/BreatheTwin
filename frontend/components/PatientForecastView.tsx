'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { PATIENTS, Patient } from '@/lib/data';
import {
  CopilotReport,
  ForecastPayload,
  ForecastDriverItem,
  ActiveWhatIfScenario,
  getPatient,
  getPatientForecast,
  simulatePatientForecastWhatIf,
  getPatientCopilotReport,
  getStoredCustomPatients,
  buildFallbackForecastPayload,
  getActiveWhatIfScenario,
  saveActiveWhatIfScenario,
  clearActiveWhatIfScenario,
  getForecastStreamUrl,
} from '@/lib/api';
import PatientNavHeader from '@/components/PatientNavHeader';
import StatusChip from '@/components/StatusChip';

const GROUP_META: Record<
  ForecastDriverItem['group'],
  { title: string; order: number }
> = {
  air_quality: { title: 'Air Quality', order: 1 },
  wearable: { title: 'Wearable', order: 2 },
  medication: { title: 'Medication', order: 3 },
  history: { title: 'History', order: 4 },
};

function formatSignedPts(val: number): string {
  const rounded = Math.round(val * 10) / 10;
  if (rounded > 0) return `+${rounded.toFixed(1)} pts`;
  if (rounded < 0) return `${rounded.toFixed(1)} pts`;
  return '0.0 pts';
}

function formatShortTime(isoStr?: string): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('en-IN', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return isoStr;
  }
}

export default function PatientForecastView({
  patientId,
  initialPatient: propPatient,
  initialForecast: propForecast,
}: {
  patientId: string;
  initialPatient?: Patient;
  initialForecast?: ForecastPayload;
}) {
  const defaultPatient =
    propPatient ||
    PATIENTS.find((p) => p.id === patientId) ||
    getStoredCustomPatients().find((p) => p.id === patientId) ||
    PATIENTS[0];

  const [patient, setPatient] = useState<Patient>(defaultPatient);
  const [forecast, setForecast] = useState<ForecastPayload>(
    () => propForecast || buildFallbackForecastPayload(defaultPatient)
  );

  // V1 interactive state: hover/keyboard crosshair hour (0..48) & View as table toggle
  const [inspectedHour, setInspectedHour] = useState<number | null>(null);
  const [viewAsTable, setViewAsTable] = useState<boolean>(false);

  // V2 interactive state: hovered/focused driver row for 1-sentence reason
  const [activeDriverId, setActiveDriverId] = useState<string | null>(null);

  // V5 What-if overlay state (active scenario from sandbox or quick test)
  const [activeScenario, setActiveScenario] = useState<ActiveWhatIfScenario | null>(null);
  const [whatIfForecast, setWhatIfForecast] = useState<ForecastPayload | null>(null);

  // Action row secondary action: Patient Copilot Report (collapsed by default)
  const [isReportExpanded, setIsReportExpanded] = useState<boolean>(false);
  const [copilotReport, setCopilotReport] = useState<CopilotReport | null>(null);
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);

  // Fetch unified forecast payload & patient state tied to simulation clock
  useEffect(() => {
    let isMounted = true;
    const syncData = async () => {
      try {
        const [livePatient, liveForecast] = await Promise.all([
          getPatient(patientId),
          getPatientForecast(patientId),
        ]);
        if (!isMounted) return;
        if (livePatient) setPatient(livePatient);
        if (liveForecast) setForecast(liveForecast);
      } catch (err) {
        console.warn('Using fallback forecast payload:', err);
      }
    };
    syncData();

    // Check active scenario from What-If sandbox in localStorage
    const storedScenario = getActiveWhatIfScenario(patientId);
    setActiveScenario(storedScenario);

    // Subscribe to SSE /api/patients/:id/forecast/stream for live simulation clock updates
    let es: EventSource | null = null;
    if (typeof window !== 'undefined' && typeof EventSource !== 'undefined') {
      try {
        es = new EventSource(getForecastStreamUrl(patientId));
        es.addEventListener('forecast.updated', (evt: MessageEvent) => {
          if (!isMounted) return;
          try {
            const updated: ForecastPayload = JSON.parse(evt.data);
            if (updated && updated.patientId === patientId) {
              setForecast(updated);
            }
          } catch {
            // ignore malformed event
          }
        });
      } catch {
        // SSE optional if backend offline
      }
    }

    return () => {
      isMounted = false;
      if (es) es.close();
    };
  }, [patientId]);

  // Whenever an active What-If scenario is present, fetch its ghost curve in the same ForecastPayload shape
  useEffect(() => {
    let isCancelled = false;
    if (!activeScenario) {
      setWhatIfForecast(null);
      return;
    }
    simulatePatientForecastWhatIf(patientId, activeScenario, {
      asOf: forecast.asOf,
      hour: forecast.simulationHour,
    }).then((res) => {
      if (!isCancelled && res) {
        setWhatIfForecast(res);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [patientId, activeScenario, forecast.asOf, forecast.simulationHour]);

  const handleClearScenario = useCallback(() => {
    clearActiveWhatIfScenario(patientId);
    setActiveScenario(null);
    setWhatIfForecast(null);
  }, [patientId]);

  const handleQuickPreviewScenario = useCallback(
    (driver: ForecastDriverItem) => {
      const scenario: ActiveWhatIfScenario =
        driver.group === 'medication'
          ? {
              scenarioId: 'inhaler-push',
              scenarioLabel: '100% controller adherence',
              outdoor_hours: 2.5,
              wear_n95: false,
              target_adherence_pct: 100,
              hepa_purifier: false,
            }
          : {
              scenarioId: 'n95-commute',
              scenarioLabel: 'Stay indoors + N95 mask',
              outdoor_hours: 1.0,
              wear_n95: true,
              target_adherence_pct: patient.controllerAdherence,
              hepa_purifier: true,
            };
      saveActiveWhatIfScenario(patientId, scenario);
      setActiveScenario(scenario);
    },
    [patient.controllerAdherence, patientId]
  );

  const handleToggleAndGenerateReport = async () => {
    if (!isReportExpanded) {
      setIsReportExpanded(true);
      if (!copilotReport && !isGeneratingReport) {
        setIsGeneratingReport(true);
        setCopilotError(null);
        try {
          const report = await getPatientCopilotReport(patientId, forecast.simulationHour);
          setCopilotReport(report);
        } catch (error) {
          setCopilotError(error instanceof Error ? error.message : 'Report generation failed.');
        } finally {
          setIsGeneratingReport(false);
        }
      }
    } else {
      setIsReportExpanded(false);
    }
  };

  // =========================================================================
  // V1 DATA EXTRACTION & SVG GEOMETRY (Fixed Y-axis 0% to 100%, ~320px tall)
  // =========================================================================
  const curve = forecast.curve && forecast.curve.length > 0 ? forecast.curve : [];
  const pt24 = curve.find((c) => c.h === 24) || curve[Math.floor(curve.length / 2)] || { h: 24, p: 0.5, lo: 0.4, hi: 0.6 };
  const pt48 = curve[curve.length - 1] || { h: 48, p: 0.6, lo: 0.5, hi: 0.7 };

  const risk24Pct = Math.round(pt24.p * 100);
  const risk24LoPct = Math.round(pt24.lo * 100);
  const risk24HiPct = Math.round(pt24.hi * 100);

  const risk48Pct = Math.round(pt48.p * 100);
  const risk48LoPct = Math.round(pt48.lo * 100);
  const risk48HiPct = Math.round(pt48.hi * 100);

  const thresholdPct = Math.round((forecast.alertPolicy?.threshold ?? 0.7) * 100);
  // Status label comes strictly from the server payload
  const serverStatusLabel =
    forecast.statusLabel ||
    (forecast.status === 'alert' ? 'Alert' : forecast.status === 'watch' ? 'Watch' : 'Normal');

  const v1Width = 1000;
  const v1Height = 320;
  const v1PadL = 52;
  const v1PadR = 44;
  const v1PadT = 26;
  const v1PadB = 42;
  const v1PlotW = v1Width - v1PadL - v1PadR;
  const v1PlotH = v1Height - v1PadT - v1PadB;

  const getV1X = (h: number) => v1PadL + (Math.max(0, Math.min(48, h)) / 48) * v1PlotW;
  const getV1Y = (probFraction: number) =>
    v1PadT + v1PlotH - Math.max(0, Math.min(1, probFraction)) * v1PlotH;

  const v1LinePath = useMemo(() => {
    return curve
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${getV1X(pt.h).toFixed(1)} ${getV1Y(pt.p).toFixed(1)}`)
      .join(' ');
  }, [curve]);

  const v1BandPoints = useMemo(() => {
    if (curve.length === 0) return '';
    const upper = curve.map((pt) => `${getV1X(pt.h).toFixed(1)},${getV1Y(pt.hi).toFixed(1)}`);
    const lower = [...curve]
      .reverse()
      .map((pt) => `${getV1X(pt.h).toFixed(1)},${getV1Y(pt.lo).toFixed(1)}`);
    return [...upper, ...lower].join(' ');
  }, [curve]);

  const v5Curve = whatIfForecast?.curve || null;
  const v5LinePath = useMemo(() => {
    if (!v5Curve || v5Curve.length === 0) return '';
    return v5Curve
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${getV1X(pt.h).toFixed(1)} ${getV1Y(pt.p).toFixed(1)}`)
      .join(' ');
  }, [v5Curve]);

  const v5BandPoints = useMemo(() => {
    if (!v5Curve || v5Curve.length === 0) return '';
    const upper = v5Curve.map((pt) => `${getV1X(pt.h).toFixed(1)},${getV1Y(pt.hi).toFixed(1)}`);
    const lower = [...v5Curve]
      .reverse()
      .map((pt) => `${getV1X(pt.h).toFixed(1)},${getV1Y(pt.lo).toFixed(1)}`);
    return [...upper, ...lower].join(' ');
  }, [v5Curve]);

  const handleV1KeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setInspectedHour((prev) => (prev === null ? 0 : Math.min(48, prev + 1)));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setInspectedHour((prev) => (prev === null ? 48 : Math.max(0, prev - 1)));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setInspectedHour(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setInspectedHour(48);
    } else if (e.key === 'Escape') {
      setInspectedHour(null);
    }
  };

  const activeCurvePoint =
    inspectedHour !== null
      ? curve.find((c) => c.h === inspectedHour) || pt48
      : null;
  const activeV5Point =
    inspectedHour !== null && v5Curve
      ? v5Curve.find((c) => c.h === inspectedHour) || null
      : null;

  // =========================================================================
  // V2 DRIVER WATERFALL DATA & GROUPING
  // =========================================================================
  const baselinePct = Math.round((forecast.drivers?.baseline ?? 0.3) * 1000) / 10;
  const isWatchOrAlert = forecast.status === 'watch' || forecast.status === 'alert';

  const waterfallGroups = useMemo(() => {
    const items = forecast.drivers?.items || [];
    const groupedMap = new Map<
      ForecastDriverItem['group'],
      { group: ForecastDriverItem['group']; title: string; totalPp: number; items: ForecastDriverItem[] }
    >();

    for (const item of items) {
      const g = item.group;
      if (!groupedMap.has(g)) {
        groupedMap.set(g, {
          group: g,
          title: GROUP_META[g]?.title || g,
          totalPp: 0,
          items: [],
        });
      }
      const entry = groupedMap.get(g)!;
      entry.items.push(item);
      entry.totalPp = Math.round((entry.totalPp + item.deltaPp) * 10) / 10;
    }

    // Order within each group: when status is Watch or Alert, risk-raising drivers come first, then by size of effect
    const groupsArr = Array.from(groupedMap.values());
    for (const grp of groupsArr) {
      grp.items.sort((a, b) => {
        if (isWatchOrAlert) {
          const aRaise = a.deltaPp > 0 ? 0 : 1;
          const bRaise = b.deltaPp > 0 ? 0 : 1;
          if (aRaise !== bRaise) return aRaise - bRaise;
        }
        return Math.abs(b.deltaPp) - Math.abs(a.deltaPp);
      });
    }

    // Order groups: when Watch or Alert, risk-raising group totals first, then by magnitude
    groupsArr.sort((a, b) => {
      if (isWatchOrAlert) {
        const aRaise = a.totalPp > 0 ? 0 : 1;
        const bRaise = b.totalPp > 0 ? 0 : 1;
        if (aRaise !== bRaise) return aRaise - bRaise;
      }
      return Math.abs(b.totalPp) - Math.abs(a.totalPp);
    });

    // Compute running cumulative start and end for each row in the waterfall
    let running = baselinePct;
    const enrichedGroups = groupsArr.map((grp) => {
      const rows = grp.items.map((item) => {
        const start = running;
        const end = Math.round((running + item.deltaPp) * 10) / 10;
        running = end;
        return { ...item, startPct: start, endPct: end };
      });
      return { ...grp, rows };
    });

    const otherDelta = Math.round((forecast.drivers?.other?.deltaPp ?? 0) * 10) / 10;
    const otherRow = {
      startPct: running,
      endPct: Math.round((running + otherDelta) * 10) / 10,
      deltaPp: otherDelta,
    };
    const finalPct = otherRow.endPct;

    // Determine domain [minScale, maxScale] so waterfall bars never clip
    const allPoints = [baselinePct, finalPct];
    for (const g of enrichedGroups) {
      for (const r of g.rows) {
        allPoints.push(r.startPct, r.endPct);
      }
    }
    const minVal = Math.min(0, ...allPoints);
    const maxVal = Math.max(100, ...allPoints);

    return {
      groups: enrichedGroups,
      otherRow,
      finalPct,
      minScale: minVal,
      maxScale: maxVal,
    };
  }, [forecast.drivers, baselinePct, isWatchOrAlert]);

  const inspectedDriver = useMemo(() => {
    const allItems = forecast.drivers?.items || [];
    if (activeDriverId) {
      return allItems.find((d) => d.id === activeDriverId) || allItems[0] || null;
    }
    return allItems[0] || null;
  }, [forecast.drivers, activeDriverId]);

  // =========================================================================
  // V4 AIR-QUALITY TIMELINE GEOMETRY (~200px tall)
  // =========================================================================
  const aqPoints = forecast.airQuality?.points || [];
  const aqBins = forecast.airQuality?.bins || [
    { min: 0, max: 30, aqiMin: 0, aqiMax: 50, category: 'Good' },
    { min: 30, max: 60, aqiMin: 51, aqiMax: 100, category: 'Satisfactory' },
    { min: 60, max: 90, aqiMin: 101, aqiMax: 200, category: 'Moderate' },
    { min: 90, max: 120, aqiMin: 201, aqiMax: 300, category: 'Poor' },
    { min: 120, max: 250, aqiMin: 301, aqiMax: 400, category: 'Very Poor' },
    { min: 250, max: 500, aqiMin: 401, aqiMax: 500, category: 'Severe' },
  ];
  const whoGuideline = forecast.airQuality?.whoGuideline ?? 15;

  const v4Width = 1000;
  const v4Height = 200;
  const v4PadL = 52;
  const v4PadR = 88;
  const v4PadT = 24;
  const v4PadB = 34;
  const v4PlotW = v4Width - v4PadL - v4PadR;
  const v4PlotH = v4Height - v4PadT - v4PadB;

  const maxPm25 = useMemo(() => {
    const rawMax = aqPoints.reduce((m, p) => Math.max(m, p.pm25), 120);
    return Math.min(500, Math.max(150, Math.ceil((rawMax * 1.18) / 30) * 30));
  }, [aqPoints]);

  const getV4X = (idx: number) =>
    v4PadL + (aqPoints.length > 1 ? (idx / (aqPoints.length - 1)) * v4PlotW : 0);
  const getV4Y = (pm: number) =>
    v4PadT + v4PlotH - (Math.max(0, Math.min(maxPm25, pm)) / maxPm25) * v4PlotH;

  const nowAqIdx = useMemo(() => {
    const idx = aqPoints.findIndex((p) => p.h === 0);
    if (idx >= 0) return idx;
    let lastObs = 0;
    aqPoints.forEach((p, i) => {
      if (p.kind === 'observed') lastObs = i;
    });
    return lastObs;
  }, [aqPoints]);

  const v4ObsPath = useMemo(() => {
    const slice = aqPoints.slice(0, nowAqIdx + 1);
    return slice
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getV4X(i).toFixed(1)} ${getV4Y(pt.pm25).toFixed(1)}`)
      .join(' ');
  }, [aqPoints, nowAqIdx, maxPm25]);

  const v4ForecastPath = useMemo(() => {
    const slice = aqPoints.slice(nowAqIdx);
    return slice
      .map(
        (pt, i) =>
          `${i === 0 ? 'M' : 'L'} ${getV4X(nowAqIdx + i).toFixed(1)} ${getV4Y(pt.pm25).toFixed(1)}`
      )
      .join(' ');
  }, [aqPoints, nowAqIdx, maxPm25]);

  const peakForecastInfo = useMemo(() => {
    let bestIdx = -1;
    let bestVal = -Infinity;
    aqPoints.forEach((pt, idx) => {
      if (pt.kind === 'forecast' && pt.pm25 > bestVal) {
        bestVal = pt.pm25;
        bestIdx = idx;
      }
    });
    if (bestIdx < 0 && aqPoints.length > 0) {
      bestIdx = aqPoints.length - 1;
      bestVal = aqPoints[bestIdx].pm25;
    }
    return bestIdx >= 0
      ? {
          idx: bestIdx,
          point: aqPoints[bestIdx],
          x: getV4X(bestIdx),
          y: getV4Y(bestVal),
        }
      : null;
  }, [aqPoints, maxPm25]);

  const currentPm25 = forecast.airQuality?.current?.pm25 ?? patient.currentAirQuality.pm25;
  const currentPm10 = forecast.airQuality?.current?.pm10 ?? patient.currentAirQuality.pm10;
  const currentTemp = forecast.airQuality?.current?.temp ?? patient.currentAirQuality.temp;
  const currentHumidity = forecast.airQuality?.current?.humidity ?? patient.currentAirQuality.humidity;
  const aqiValue = forecast.airQuality?.aqi?.value ?? patient.currentAirQuality.aqi;
  const aqiCategory = forecast.airQuality?.aqi?.category ?? patient.currentAirQuality.aqiCategory;

  return (
    <div className="space-y-5 overflow-x-hidden">
      {/* 1. Patient Strip (Compact): ID & name, city & monitor, confirmed severity, controller adherence, clinical status chip */}
      <PatientNavHeader patient={patient} />

      {/* 2. Disclaimer Banner: one line, stating that the tool estimates risk and does not diagnose or prescribe */}
      <div
        role="note"
        className="border border-[#12612F] bg-[#04130A] px-3.5 py-2 text-xs flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex items-center space-x-2 min-w-0">
          <span className="w-2 h-2 bg-[#FFE14A] inline-block shrink-0" />
          <span className="text-[#B6FFCC] font-medium">
            Clinical decision support: BreathTwin estimates flare-up risk probability and does not diagnose or prescribe treatment.
          </span>
        </div>
        <span className="text-[11px] font-mono text-[#2FBF63] shrink-0">
          AS OF {formatShortTime(forecast.asOf)} IST
        </span>
      </div>

      {/* 3. V1 Risk Curve (Full width, about 320 px tall) + V5 Optional What-If Ghost Overlay */}
      <section
        aria-label="48-hour flare-up risk curve"
        className="border border-[#12612F] bg-[#04130A] p-4 sm:p-5 space-y-3"
      >
        {/* Headline above the chart: 48-hour figure with its range, and status chip (Normal, Watch, Alert) from alert policy */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#12612F]/40 pb-3">
          <div className="space-y-1">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#2FBF63]">
              V1 &bull; 48-HOUR CUMULATIVE FLARE-UP RISK CURVE
            </div>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <div className="flex items-baseline space-x-2">
                <span
                  className={`text-3xl sm:text-4xl font-bold font-mono tabular-nums ${
                    forecast.status === 'alert'
                      ? 'text-[#FF2A1A] glow-danger'
                      : forecast.status === 'watch'
                      ? 'text-[#FFA61F]'
                      : 'text-[#4CFF8A]'
                  }`}
                >
                  {risk48Pct}%
                </span>
                <span className="text-xs font-mono text-[#B6FFCC]">
                  at 48h (range {risk48LoPct}%&ndash;{risk48HiPct}%)
                </span>
              </div>
              <span className="text-xs font-mono text-[#2FBF63]">
                24h: <strong className="text-[#B6FFCC]">{risk24Pct}%</strong> ({risk24LoPct}%&ndash;{risk24HiPct}%)
              </span>
              <StatusChip status={serverStatusLabel} size="sm" />
              {forecast.dataQuality?.coldStart && (
                <span className="text-[10px] font-mono px-2 py-0.5 border border-[#FFE14A] text-[#FFE14A]">
                  CALIBRATING BASELINE (DAY {forecast.dataQuality.baselineDays})
                </span>
              )}
            </div>
          </div>

          {/* Controls: V5 Active Scenario Badge / Clear & View as Table Toggle */}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {whatIfForecast && activeScenario && (
              <div className="flex items-center space-x-2 border border-[#4CFF8A] bg-[#061C0E] px-2.5 py-1 text-xs font-mono">
                <span className="text-[#4CFF8A] font-semibold">
                  What-if: {whatIfForecast.scenarioLabel || activeScenario.scenarioLabel} (
                  {formatSignedPts(whatIfForecast.delta48hPp ?? 0)} at 48h)
                </span>
                <button
                  type="button"
                  onClick={handleClearScenario}
                  className="text-[10px] uppercase px-1.5 py-0.5 border border-[#12612F] bg-[#04130A] text-[#B6FFCC] hover:border-[#FF2A1A] hover:text-[#FF2A1A] cursor-pointer"
                  title="Remove what-if overlay"
                >
                  Clear
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setViewAsTable((prev) => !prev)}
              aria-pressed={viewAsTable}
              className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-[#12612F] bg-[#061C0E] text-[#B6FFCC] hover:border-[#4CFF8A] hover:text-[#4CFF8A] transition-colors cursor-pointer"
            >
              {viewAsTable ? 'View as chart' : 'View as table'}
            </button>
          </div>
        </div>

        {/* V1 SVG Chart (~320px tall) or Accessible Table Toggle */}
        {!viewAsTable ? (
          <div className="w-full">
            <svg
              viewBox={`0 0 ${v1Width} ${v1Height}`}
              tabIndex={0}
              role="img"
              aria-label={`Cumulative flare-up risk from now to +48 hours: ${risk24Pct}% at 24h and ${risk48Pct}% at 48h. Use left and right arrow keys to inspect each hour.`}
              onKeyDown={handleV1KeyDown}
              onMouseLeave={() => setInspectedHour(null)}
              className="w-full h-[300px] sm:h-[320px] select-none overflow-visible focus:outline-none focus:ring-1 focus:ring-[#4CFF8A]"
            >
              {/* Fixed Y-axis Gridlines (0% to 100%) */}
              {[0, 25, 50, 75, 100].map((pct) => {
                const y = getV1Y(pct / 100);
                return (
                  <g key={pct}>
                    <line
                      x1={v1PadL}
                      y1={y}
                      x2={v1Width - v1PadR}
                      y2={y}
                      stroke="#12612F"
                      strokeOpacity={pct === 0 ? 0.8 : 0.3}
                      strokeWidth="1"
                    />
                    <text
                      x={v1PadL - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="11"
                      className="font-mono fill-[#2FBF63]"
                    >
                      {pct}%
                    </text>
                  </g>
                );
              })}

              {/* X-axis Hour Grid & Labels (0h to +48h) */}
              {[0, 6, 12, 18, 24, 30, 36, 42, 48].map((h) => {
                const x = getV1X(h);
                return (
                  <g key={h}>
                    <line
                      x1={x}
                      y1={v1PadT}
                      x2={x}
                      y2={v1PadT + v1PlotH}
                      stroke="#12612F"
                      strokeOpacity={h === 0 || h === 24 || h === 48 ? 0.5 : 0.18}
                      strokeWidth="1"
                      strokeDasharray={h === 0 ? undefined : '2 3'}
                    />
                    <text
                      x={x}
                      y={v1Height - 10}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={h === 0 || h === 24 || h === 48 ? '700' : '500'}
                      className="font-mono fill-[#B6FFCC]"
                    >
                      {h === 0 ? 'Now (0h)' : `+${h}h`}
                    </text>
                  </g>
                );
              })}

              {/* Vertical Now Marker at h = 0 */}
              <line
                x1={getV1X(0)}
                y1={v1PadT}
                x2={getV1X(0)}
                y2={v1PadT + v1PlotH}
                stroke="#4CFF8A"
                strokeWidth="1.5"
              />
              <text
                x={getV1X(0) + 6}
                y={v1PadT + 12}
                fontSize="10"
                fontWeight="700"
                className="font-mono fill-[#4CFF8A] uppercase"
              >
                NOW
              </text>

              {/* Dashed Horizontal Alert Threshold Line with its value */}
              <line
                x1={v1PadL}
                y1={getV1Y(thresholdPct / 100)}
                x2={v1Width - v1PadR}
                y2={getV1Y(thresholdPct / 100)}
                stroke="#FF2A1A"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
              <text
                x={v1Width - v1PadR - 6}
                y={getV1Y(thresholdPct / 100) - 6}
                textAnchor="end"
                fontSize="10.5"
                fontWeight="700"
                fill="#FF2A1A"
                className="font-mono uppercase"
              >
                Alert threshold ({thresholdPct}%)
              </text>

              {/* Conformal Uncertainty Interval Band (~10% opacity) */}
              {v1BandPoints && (
                <polygon
                  points={v1BandPoints}
                  fill={forecast.status === 'alert' ? '#FF2A1A' : '#4CFF8A'}
                  fillOpacity="0.11"
                />
              )}

              {/* V5 Optional What-If Ghost Band & Dashed Line */}
              {v5BandPoints && (
                <polygon
                  points={v5BandPoints}
                  fill="#38BDF8"
                  fillOpacity="0.08"
                />
              )}
              {v5LinePath && (
                <path
                  d={v5LinePath}
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
              )}
              {v5Curve && v5Curve.length > 0 && (
                <g>
                  <circle
                    cx={getV1X(48)}
                    cy={getV1Y(v5Curve[v5Curve.length - 1].p)}
                    r="4"
                    fill="#38BDF8"
                  />
                  <text
                    x={getV1X(48) - 10}
                    y={Math.min(v1PadT + v1PlotH - 6, getV1Y(v5Curve[v5Curve.length - 1].p) + 15)}
                    textAnchor="end"
                    fontSize="10.5"
                    fontWeight="700"
                    fill="#38BDF8"
                    className="font-mono"
                  >
                    {whatIfForecast?.scenarioLabel || 'What-if'}:{' '}
                    {Math.round(v5Curve[v5Curve.length - 1].p * 100)}% (
                    {formatSignedPts(whatIfForecast?.delta48hPp ?? 0)})
                  </text>
                </g>
              )}

              {/* Primary 2 px Risk Curve for p */}
              <path
                d={v1LinePath}
                fill="none"
                stroke={forecast.status === 'alert' ? '#FF2A1A' : '#4CFF8A'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Labelled Dot at 24h */}
              <g>
                <circle
                  cx={getV1X(24)}
                  cy={getV1Y(pt24.p)}
                  r="5"
                  fill="#04130A"
                  stroke={forecast.status === 'alert' ? '#FF2A1A' : '#4CFF8A'}
                  strokeWidth="2.5"
                />
                <text
                  x={getV1X(24)}
                  y={Math.max(v1PadT + 12, getV1Y(pt24.p) - 10)}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  className="font-mono fill-[#B6FFCC]"
                >
                  24h: {risk24Pct}% [{risk24LoPct}&ndash;{risk24HiPct}%]
                </text>
              </g>

              {/* Labelled Dot at 48h */}
              <g>
                <circle
                  cx={getV1X(48)}
                  cy={getV1Y(pt48.p)}
                  r="5.5"
                  fill="#04130A"
                  stroke={forecast.status === 'alert' ? '#FF2A1A' : '#4CFF8A'}
                  strokeWidth="2.5"
                />
                <text
                  x={getV1X(48) - 8}
                  y={Math.max(v1PadT + 14, getV1Y(pt48.p) - 10)}
                  textAnchor="end"
                  fontSize="11.5"
                  fontWeight="700"
                  className="font-mono fill-[#B6FFCC]"
                >
                  48h: {risk48Pct}% [{risk48LoPct}&ndash;{risk48HiPct}%]
                </text>
              </g>

              {/* Invisible Hourly Hit Rectangles for Smooth Hover Crosshair */}
              {curve.map((pt) => {
                const sliceW = v1PlotW / 48;
                return (
                  <rect
                    key={pt.h}
                    x={getV1X(pt.h) - sliceW / 2}
                    y={v1PadT}
                    width={sliceW}
                    height={v1PlotH}
                    fill="transparent"
                    className="cursor-crosshair"
                    onMouseEnter={() => setInspectedHour(pt.h)}
                    onClick={() => setInspectedHour(pt.h)}
                  />
                );
              })}

              {/* Interactive Crosshair & Tooltip */}
              {activeCurvePoint && (
                <g className="pointer-events-none">
                  <line
                    x1={getV1X(activeCurvePoint.h)}
                    y1={v1PadT}
                    x2={getV1X(activeCurvePoint.h)}
                    y2={v1PadT + v1PlotH}
                    stroke="#B6FFCC"
                    strokeWidth="1.2"
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={getV1X(activeCurvePoint.h)}
                    cy={getV1Y(activeCurvePoint.p)}
                    r="5"
                    fill="#B6FFCC"
                    stroke="#04130A"
                    strokeWidth="2"
                  />
                  {(() => {
                    const boxW = activeV5Point ? 225 : 190;
                    const boxH = activeV5Point ? 54 : 38;
                    const rawX = getV1X(activeCurvePoint.h) - boxW / 2;
                    const clampedX = Math.max(v1PadL + 4, Math.min(v1Width - v1PadR - boxW - 4, rawX));
                    const rawY = getV1Y(activeCurvePoint.p) - boxH - 12;
                    const clampedY = rawY < v1PadT ? getV1Y(activeCurvePoint.p) + 14 : rawY;
                    return (
                      <g>
                        <rect
                          x={clampedX}
                          y={clampedY}
                          width={boxW}
                          height={boxH}
                          rx="3"
                          className="chart-tooltip-bg"
                          strokeWidth="1.2"
                        />
                        <text
                          x={clampedX + 10}
                          y={clampedY + 16}
                          fontSize="11"
                          fontWeight="700"
                          className="chart-tooltip-text font-mono"
                        >
                          +{activeCurvePoint.h}h: {Math.round(activeCurvePoint.p * 100)}% (range{' '}
                          {Math.round(activeCurvePoint.lo * 100)}%&ndash;
                          {Math.round(activeCurvePoint.hi * 100)}%)
                        </text>
                        <text
                          x={clampedX + 10}
                          y={clampedY + 31}
                          fontSize="9.5"
                          className="chart-tooltip-text font-mono opacity-80"
                        >
                          {formatShortTime(activeCurvePoint.t)}
                        </text>
                        {activeV5Point && (
                          <text
                            x={clampedX + 10}
                            y={clampedY + 46}
                            fontSize="10"
                            fontWeight="700"
                            fill="#0284C7"
                            className="font-mono"
                          >
                            What-if: {Math.round(activeV5Point.p * 100)}% (
                            {Math.round(activeV5Point.lo * 100)}%&ndash;
                            {Math.round(activeV5Point.hi * 100)}%)
                          </text>
                        )}
                      </g>
                    );
                  })()}
                </g>
              )}
            </svg>
            <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-[#2FBF63] pt-1">
              <span>
                Hover or focus chart and use &larr; / &rarr; arrow keys to inspect hourly cumulative probability.
              </span>
              <span>Y-AXIS FIXED 0&ndash;100% &bull; CONFORMAL 90% BAND</span>
            </div>
          </div>
        ) : (
          /* Accessible Table View Toggle */
          <div className="border border-[#12612F] bg-[#061C0E] p-3">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-[#12612F] text-[#2FBF63] uppercase">
                  <th className="py-2 px-2">Horizon</th>
                  <th className="py-2 px-2">Timestamp (IST)</th>
                  <th className="py-2 px-2">Cumulative Risk (p)</th>
                  <th className="py-2 px-2">90% Interval [lo &ndash; hi]</th>
                  {v5Curve && <th className="py-2 px-2">What-If Scenario</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#12612F]/40 text-[#B6FFCC]">
                {[0, 6, 12, 18, 24, 30, 36, 42, 48].map((h) => {
                  const row = curve.find((c) => c.h === h) || curve[0];
                  const cfRow = v5Curve?.find((c) => c.h === h);
                  if (!row) return null;
                  return (
                    <tr key={h} className={h === 24 || h === 48 ? 'font-bold bg-[#04130A]' : ''}>
                      <td className="py-1.5 px-2">{h === 0 ? 'Now (0h)' : `+${h}h`}</td>
                      <td className="py-1.5 px-2">{formatShortTime(row.t)}</td>
                      <td className="py-1.5 px-2">{Math.round(row.p * 100)}%</td>
                      <td className="py-1.5 px-2">
                        {Math.round(row.lo * 100)}%&ndash;{Math.round(row.hi * 100)}%
                      </td>
                      {v5Curve && (
                        <td className="py-1.5 px-2 text-[#4CFF8A]">
                          {cfRow
                            ? `${Math.round(cfRow.p * 100)}% (${Math.round(cfRow.lo * 100)}%–${Math.round(
                                cfRow.hi * 100
                              )}%)`
                            : '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Middle Row: V2 Driver Waterfall (Left, ~60% width) beside V3 Signal Drift (Right, ~40% width) */}
      {/* Stacks in the same order below 900px wide (min-[900px]:grid-cols-12) */}
      <div className="grid grid-cols-1 min-[900px]:grid-cols-12 gap-5 items-start">
        {/* V2. Driver Waterfall (left, ~60% width -> 7 of 12 cols) */}
        <section
          aria-label="Driver waterfall attribution"
          className="min-[900px]:col-span-7 border border-[#12612F] bg-[#04130A] p-4 sm:p-5 space-y-4 min-w-0"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#12612F]/40 pb-3">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#2FBF63]">
                V2 &bull; DRIVER WATERFALL (COHORT BASELINE TO 48H RISK)
              </div>
              <h2 className="text-sm sm:text-base font-semibold text-[#B6FFCC] mt-0.5">
                What moved this patient&apos;s risk away from the {baselinePct.toFixed(0)}% cohort baseline?
              </h2>
            </div>
            <div className="flex items-center space-x-3 text-[11px] font-mono">
              <span className="inline-flex items-center space-x-1">
                <span className="w-2.5 h-2.5 inline-block bg-[#DC2626]" />
                <span className="text-[#B6FFCC]">Raises risk (+pts)</span>
              </span>
              <span className="inline-flex items-center space-x-1">
                <span className="w-2.5 h-2.5 inline-block bg-[#0284C7]" />
                <span className="text-[#B6FFCC]">Lowers risk (-pts)</span>
              </span>
            </div>
          </div>

          {/* Starting Cohort Baseline Bar */}
          <div className="space-y-2.5 text-xs">
            <div className="grid grid-cols-12 items-center gap-2 py-1.5 px-2.5 bg-[#061C0E] border border-[#12612F] font-mono">
              <div className="col-span-5 text-[#B6FFCC] font-semibold truncate">
                Cohort baseline risk
              </div>
              <div className="col-span-5 relative h-4 bg-[#04130A] border border-[#12612F]">
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: '0%',
                    width: `${Math.min(100, Math.max(2, baselinePct))}%`,
                    backgroundColor: '#16A34A',
                  }}
                />
              </div>
              <div className="col-span-2 text-right font-bold text-[#B6FFCC]">
                {baselinePct.toFixed(1)}%
              </div>
            </div>

            {/* Grouped Stream Waterfall Rows */}
            {waterfallGroups.groups.map((grp) => (
              <div key={grp.group} className="border border-[#12612F] bg-[#04130A]">
                {/* Stream Group Header with Group Total */}
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#061C0E] border-b border-[#12612F] font-mono text-[11px]">
                  <span className="uppercase font-bold tracking-wider text-[#2FBF63]">
                    {grp.title} Stream
                  </span>
                  <span
                    className={`font-bold ${
                      grp.totalPp > 0 ? 'text-[#FF2A1A]' : grp.totalPp < 0 ? 'text-[#0284C7]' : 'text-[#B6FFCC]'
                    }`}
                  >
                    Group total: {formatSignedPts(grp.totalPp)}
                  </span>
                </div>

                <div className="divide-y divide-[#12612F]/40">
                  {grp.rows.map((row) => {
                    const isRaising = row.deltaPp > 0;
                    const spanScale = Math.max(100, waterfallGroups.maxScale - waterfallGroups.minScale);
                    const leftPct = Math.max(
                      0,
                      Math.min(
                        96,
                        ((Math.min(row.startPct, row.endPct) - waterfallGroups.minScale) / spanScale) * 100
                      )
                    );
                    const widthPct = Math.max(
                      2.5,
                      Math.min(100 - leftPct, (Math.abs(row.deltaPp) / spanScale) * 100)
                    );
                    const presetSlug =
                      row.group === 'medication' ? 'inhaler-push' : 'n95-commute';

                    return (
                      <div
                        key={row.id}
                        tabIndex={0}
                        onMouseEnter={() => setActiveDriverId(row.id)}
                        onFocus={() => setActiveDriverId(row.id)}
                        title={row.text}
                        className="p-2.5 bg-[#04130A] hover:bg-[#061C0E] transition-colors space-y-1.5 focus:outline-none focus:bg-[#061C0E]"
                      >
                        <div className="grid grid-cols-12 items-center gap-2">
                          {/* Driver Label & 24h delta */}
                          <div className="col-span-12 sm:col-span-5 min-w-0">
                            <div className="flex items-center justify-between sm:justify-start gap-2">
                              <span className="font-semibold text-[#B6FFCC] truncate">
                                {row.label}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-[#2FBF63] mt-0.5">
                              <span>
                                vs yesterday: {formatSignedPts(row.change24hPp)}
                              </span>
                              {row.modifiable && (
                                <>
                                  <span>&bull;</span>
                                  <Link
                                    href={`/patients/${patient.id}/what-if?preset=${presetSlug}&focus=${row.id}`}
                                    className="text-[#4CFF8A] hover:underline font-semibold"
                                  >
                                    Test in what-if &rarr;
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => handleQuickPreviewScenario(row)}
                                    className="text-[10px] text-[#2FBF63] hover:text-[#B6FFCC] underline cursor-pointer"
                                  >
                                    (Overlay on V1)
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Horizontal Waterfall Bar */}
                          <div className="col-span-9 sm:col-span-5 relative h-5 bg-[#061C0E] border border-[#12612F]">
                            {/* Connector tick at startPct */}
                            <div
                              className="absolute top-0 bottom-0 w-px bg-[#2FBF63]"
                              style={{ left: `${leftPct}%` }}
                            />
                            {/* Signed Bar: Red raises risk, Blue lowers risk */}
                            <div
                              className="absolute top-0.5 bottom-0.5 transition-all"
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                backgroundColor: isRaising ? '#DC2626' : '#0284C7',
                              }}
                            />
                          </div>

                          {/* Explicit Signed Label (colour is never the only cue) */}
                          <div
                            className={`col-span-3 sm:col-span-2 text-right font-mono font-bold tabular-nums ${
                              isRaising ? 'text-[#FF2A1A]' : 'text-[#0284C7]'
                            }`}
                          >
                            {formatSignedPts(row.deltaPp)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Rolled-up Other Row */}
            <div className="grid grid-cols-12 items-center gap-2 py-1.5 px-2.5 bg-[#061C0E] border border-[#12612F] font-mono">
              <div className="col-span-5 text-[#2FBF63] font-medium truncate">
                Other minor drivers (rolled up)
              </div>
              <div className="col-span-5 relative h-4 bg-[#04130A] border border-[#12612F]">
                {Math.abs(waterfallGroups.otherRow.deltaPp) > 0 && (
                  <div
                    className="absolute top-0.5 bottom-0.5"
                    style={{
                      left: `${Math.max(0, Math.min(95, Math.min(waterfallGroups.otherRow.startPct, waterfallGroups.otherRow.endPct)))}%`,
                      width: `${Math.max(2, Math.abs(waterfallGroups.otherRow.deltaPp))}%`,
                      backgroundColor:
                        waterfallGroups.otherRow.deltaPp > 0 ? '#DC2626' : '#0284C7',
                    }}
                  />
                )}
              </div>
              <div className="col-span-2 text-right font-semibold text-[#B6FFCC]">
                {formatSignedPts(waterfallGroups.otherRow.deltaPp)}
              </div>
            </div>

            {/* Ending 48-Hour Predicted Risk Bar */}
            <div className="grid grid-cols-12 items-center gap-2 py-1.5 px-2.5 bg-[#061C0E] border border-[#4CFF8A] font-mono">
              <div className="col-span-5 text-[#B6FFCC] font-bold truncate">
                Patient 48-hour forecast risk
              </div>
              <div className="col-span-5 relative h-4 bg-[#04130A] border border-[#12612F]">
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: '0%',
                    width: `${Math.min(100, Math.max(2, waterfallGroups.finalPct))}%`,
                    backgroundColor:
                      forecast.status === 'alert' ? '#DC2626' : '#0E793C',
                  }}
                />
              </div>
              <div className="col-span-2 text-right font-bold text-[#B6FFCC]">
                {waterfallGroups.finalPct.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* One-sentence hover reason from fixed alert templates */}
          {inspectedDriver && (
            <div
              aria-live="polite"
              className="border border-[#12612F] bg-[#061C0E] px-3 py-2 text-xs font-mono flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <span className="text-[#4CFF8A] font-bold mr-1.5">
                  [{inspectedDriver.label}]:
                </span>
                <span className="text-[#B6FFCC]">{inspectedDriver.text}</span>
              </div>
              <span className="text-[10px] text-[#2FBF63] shrink-0 uppercase">
                Hover row to inspect
              </span>
            </div>
          )}
        </section>

        {/* V3. Signal Drift (right, ~40% width -> 5 of 12 cols) */}
        <section
          aria-label="7-day hourly wearable signal drift"
          className="min-[900px]:col-span-5 border border-[#12612F] bg-[#04130A] p-4 sm:p-5 space-y-3.5 min-w-0"
        >
          <div className="border-b border-[#12612F]/40 pb-2.5">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#2FBF63]">
              V3 &bull; 7-DAY SIGNAL DRIFT (TOP 3 WEARABLE STREAMS)
            </div>
            <h2 className="text-sm sm:text-base font-semibold text-[#B6FFCC] mt-0.5">
              Which signals are leaving this patient&apos;s personal normal?
            </h2>
            <div className="text-[11px] text-[#2FBF63] font-mono mt-0.5">
              Shaded band: personal baseline &plusmn;1 SD &bull; Gaps: {forecast.dataQuality?.missingHours7d ?? 0} missing hrs (uninterpolated)
            </div>
          </div>

          {/* Three Stacked Small Charts (~90 px each) */}
          <div className="space-y-3">
            {(forecast.signals || []).slice(0, 3).map((sig) => {
              const pts = sig.points || [];
              const expPts = sig.expected || [];
              const hasExpected = expPts.length > 0;
              const totalSlots = pts.length + (hasExpected ? expPts.length - 1 : 0);

              const validVals = pts
                .map((p) => p.v)
                .filter((v): v is number => v !== null && v !== undefined);
              const expVals = expPts.map((p) => p.v);
              const bandLo = sig.baseline.mean - sig.baseline.sd;
              const bandHi = sig.baseline.mean + sig.baseline.sd;

              const allNums = [
                ...validVals,
                ...expVals,
                bandLo,
                bandHi,
                ...(sig.limit !== null && sig.limit !== undefined ? [sig.limit] : []),
              ];
              const rawMin = allNums.length > 0 ? Math.min(...allNums) : 0;
              const rawMax = allNums.length > 0 ? Math.max(...allNums) : 1;
              const pad = Math.max(0.05, (rawMax - rawMin) * 0.15);
              const minY = rawMin - pad;
              const maxY = rawMax + pad;
              const spanY = maxY - minY || 1;

              const sW = 420;
              const sH = 92;
              const sPadL = 8;
              const sPadR = 8;
              const sPadT = 10;
              const sPadB = 16;
              const pW = sW - sPadL - sPadR;
              const pH = sH - sPadT - sPadB;

              const getSX = (idx: number) =>
                sPadL + (totalSlots > 1 ? (idx / (totalSlots - 1)) * pW : 0);
              const getSY = (val: number) =>
                sPadT + pH - ((val - minY) / spanY) * pH;

              // Build segmented SVG path that breaks cleanly whenever pt.v === null (never interpolate)
              const segments: string[] = [];
              let currentSeg = '';
              pts.forEach((pt, idx) => {
                if (pt.v === null || pt.v === undefined) {
                  if (currentSeg) {
                    segments.push(currentSeg);
                    currentSeg = '';
                  }
                } else {
                  const x = getSX(idx).toFixed(1);
                  const y = getSY(pt.v).toFixed(1);
                  currentSeg = currentSeg ? `${currentSeg} L ${x} ${y}` : `M ${x} ${y}`;
                }
              });
              if (currentSeg) segments.push(currentSeg);

              // Expected next 48 hours dashed segment for I(t)
              const expectedPath = hasExpected
                ? expPts
                    .map((ep, i) => {
                      const idx = pts.length - 1 + i;
                      return `${i === 0 ? 'M' : 'L'} ${getSX(idx).toFixed(1)} ${getSY(ep.v).toFixed(1)}`;
                    })
                    .join(' ')
                : '';

              const latestVal = validVals.length > 0 ? validVals[validVals.length - 1] : sig.baseline.mean;
              const anchorHref = `/patients/${patient.id}#${sig.twinAnchor || 'chart-inflammation'}`;

              return (
                <Link
                  key={sig.id}
                  href={anchorHref}
                  className="block border border-[#12612F] bg-[#061C0E] p-2.5 hover:border-[#4CFF8A] transition-colors group"
                  title={`Open full ${sig.label || sig.id} chart on Twin & Sensors page`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="font-semibold text-[#B6FFCC] group-hover:text-[#4CFF8A] truncate">
                        {sig.label || sig.id}
                      </span>
                      <span className="text-[10px] font-mono text-[#2FBF63]">
                        (base {sig.baseline.mean} &plusmn; {sig.baseline.sd} {sig.unit})
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0 font-mono">
                      <span className="font-bold text-[#B6FFCC]">
                        {latestVal} {sig.unit}
                      </span>
                      <span className="text-[10px] text-[#4CFF8A] group-hover:translate-x-0.5 transition-transform">
                        Twin &rarr;
                      </span>
                    </div>
                  </div>

                  <svg
                    viewBox={`0 0 ${sW} ${sH}`}
                    className="w-full h-[88px] select-none overflow-visible"
                  >
                    {/* Shaded Baseline +/- 1 SD Band */}
                    <rect
                      x={sPadL}
                      y={getSY(bandHi)}
                      width={pW}
                      height={Math.max(2, getSY(bandLo) - getSY(bandHi))}
                      fill="#4CFF8A"
                      fillOpacity="0.12"
                    />

                    {/* Limit Line (only where twin page already shows one) */}
                    {sig.limit !== null && sig.limit !== undefined && (
                      <g>
                        <line
                          x1={sPadL}
                          y1={getSY(sig.limit)}
                          x2={sW - sPadR}
                          y2={getSY(sig.limit)}
                          stroke="#FF2A1A"
                          strokeWidth="1"
                          strokeDasharray="4 3"
                        />
                        <text
                          x={sW - sPadR - 2}
                          y={Math.max(10, getSY(sig.limit) - 3)}
                          textAnchor="end"
                          fontSize="8.5"
                          fill="#FF2A1A"
                          className="font-mono"
                        >
                          Limit {sig.limit}
                        </text>
                      </g>
                    )}

                    {/* Now divider when expected +48h segment is shown */}
                    {hasExpected && (
                      <g>
                        <line
                          x1={getSX(pts.length - 1)}
                          y1={sPadT}
                          x2={getSX(pts.length - 1)}
                          y2={sPadT + pH}
                          stroke="#2FBF63"
                          strokeWidth="1"
                          strokeDasharray="2 2"
                        />
                        <text
                          x={getSX(pts.length - 1) + 4}
                          y={sH - 3}
                          fontSize="8.5"
                          className="font-mono fill-[#2FBF63]"
                        >
                          +48h expected &rarr;
                        </text>
                      </g>
                    )}

                    {/* Observed 7-Day Hourly Line Segments (with uninterpolated gaps) */}
                    {segments.map((segD, sIdx) => (
                      <path
                        key={sIdx}
                        d={segD}
                        fill="none"
                        stroke="#4CFF8A"
                        strokeWidth="1.6"
                      />
                    ))}

                    {/* Expected Next 48h Dashed Segment for I(t) */}
                    {expectedPath && (
                      <path
                        d={expectedPath}
                        fill="none"
                        stroke="#FFA61F"
                        strokeWidth="1.6"
                        strokeDasharray="4 3"
                      />
                    )}

                    {/* Dots where a reading leaves the patient's baseline +/- 1 SD band */}
                    {pts.map((pt, idx) => {
                      if (pt.v === null || pt.v === undefined) return null;
                      const leavesBand = pt.v > bandHi || pt.v < bandLo;
                      if (!leavesBand || idx % 4 !== 0 && idx !== pts.length - 1) return null;
                      return (
                        <circle
                          key={idx}
                          cx={getSX(idx)}
                          cy={getSY(pt.v)}
                          r="2.4"
                          fill="#FF2A1A"
                        />
                      );
                    })}

                    {/* Axis Footer Labels */}
                    <text
                      x={sPadL}
                      y={sH - 3}
                      fontSize="8.5"
                      className="font-mono fill-[#2FBF63]"
                    >
                      -7d
                    </text>
                    <text
                      x={getSX(pts.length - 1) - 4}
                      y={sH - 3}
                      textAnchor="end"
                      fontSize="8.5"
                      className="font-mono fill-[#B6FFCC]"
                    >
                      Now
                    </text>
                  </svg>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {/* 5. V4 Air-Quality Timeline (Full width, about 200 px tall) + One-line Strip Below */}
      <section
        aria-label="Air-quality timeline and current exposure strip"
        className="border border-[#12612F] bg-[#04130A] p-4 sm:p-5 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/40 pb-2.5">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#2FBF63]">
              V4 &bull; AIR-QUALITY TIMELINE (PAST 24H OBSERVED + NEXT 48H FORECAST)
            </div>
            <h2 className="text-sm sm:text-base font-semibold text-[#B6FFCC] mt-0.5">
              Is ambient PM2.5 exposure about to get worse at {forecast.airQuality?.station || patient.station}?
            </h2>
          </div>
          <span className="text-xs font-mono text-[#2FBF63]">
            SOURCE: {forecast.airQuality?.source || 'CPCB'} &bull; STATION: {forecast.airQuality?.station || patient.station}
          </span>
        </div>

        {/* V4 SVG Chart (~200 px tall) */}
        <div className="w-full">
          <svg
            viewBox={`0 0 ${v4Width} ${v4Height}`}
            role="img"
            aria-label={`Hourly PM2.5 timeline for ${forecast.airQuality?.station}: observed past 24 hours and forecast next 48 hours.`}
            className="w-full h-[195px] sm:h-[205px] select-none overflow-visible"
          >
            {/* Light Background Stripes for CPCB Categories */}
            {aqBins.map((bin, bIdx) => {
              if (bin.min >= maxPm25) return null;
              const yTop = getV4Y(Math.min(maxPm25, bin.max));
              const yBot = getV4Y(bin.min);
              const bandH = Math.max(0, yBot - yTop);
              const stripeColors = [
                '#4CFF8A',
                '#2FBF63',
                '#FFE14A',
                '#FFA61F',
                '#FF5733',
                '#FF2A1A',
              ];
              const fillCol = stripeColors[Math.min(bIdx, stripeColors.length - 1)];
              return (
                <g key={bin.category}>
                  <rect
                    x={v4PadL}
                    y={yTop}
                    width={v4PlotW}
                    height={bandH}
                    fill={fillCol}
                    fillOpacity={0.07 + bIdx * 0.015}
                  />
                  {bandH >= 14 && (
                    <text
                      x={v4Width - v4PadR + 6}
                      y={yTop + bandH / 2 + 3}
                      fontSize="9.5"
                      className="font-mono fill-[#2FBF63]"
                    >
                      {bin.category}
                    </text>
                  )}
                </g>
              );
            })}

            {/* WHO 24-Hour Guideline Reference Line (15 ug/m3) */}
            <line
              x1={v4PadL}
              y1={getV4Y(whoGuideline)}
              x2={v4Width - v4PadR}
              y2={getV4Y(whoGuideline)}
              stroke="#4CFF8A"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />
            <text
              x={v4PadL + 6}
              y={Math.max(v4PadT + 10, getV4Y(whoGuideline) - 4)}
              fontSize="9.5"
              fontWeight="700"
              className="font-mono fill-[#4CFF8A]"
            >
              WHO 24h guideline ({whoGuideline} &micro;g/m&sup3;)
            </text>

            {/* Vertical Now Divider */}
            <line
              x1={getV4X(nowAqIdx)}
              y1={v4PadT}
              x2={getV4X(nowAqIdx)}
              y2={v4PadT + v4PlotH}
              stroke="#B6FFCC"
              strokeWidth="1.5"
            />
            <text
              x={getV4X(nowAqIdx) - 6}
              y={v4PadT + 12}
              textAnchor="end"
              fontSize="9.5"
              className="font-mono fill-[#2FBF63]"
            >
              &larr; Observed (-24h)
            </text>
            <text
              x={getV4X(nowAqIdx) + 6}
              y={v4PadT + 12}
              textAnchor="start"
              fontSize="9.5"
              className="font-mono fill-[#B6FFCC]"
            >
              Forecast (+48h) &rarr;
            </text>

            {/* Observed Past 24h Solid Line */}
            <path
              d={v4ObsPath}
              fill="none"
              stroke="#4CFF8A"
              strokeWidth="2"
            />

            {/* Forecast Next 48h Dashed Line */}
            <path
              d={v4ForecastPath}
              fill="none"
              stroke="#FFA61F"
              strokeWidth="2"
              strokeDasharray="5 4"
            />

            {/* Annotated Peak Forecast Hour */}
            {peakForecastInfo && (
              <g>
                <circle
                  cx={peakForecastInfo.x}
                  cy={peakForecastInfo.y}
                  r="4.5"
                  fill="#FF2A1A"
                  stroke="#04130A"
                  strokeWidth="1.5"
                />
                <text
                  x={Math.min(v4Width - v4PadR - 10, Math.max(v4PadL + 80, peakForecastInfo.x))}
                  y={Math.max(v4PadT + 14, peakForecastInfo.y - 8)}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="700"
                  fill="#FF2A1A"
                  className="font-mono"
                >
                  Peak: {peakForecastInfo.point.pm25} &micro;g/m&sup3; (
                  {peakForecastInfo.point.h && peakForecastInfo.point.h > 0
                    ? `+${peakForecastInfo.point.h}h`
                    : formatShortTime(peakForecastInfo.point.t)}
                  )
                </text>
              </g>
            )}

            {/* X-axis Ticks (-24h, -12h, Now, +12h, +24h, +36h, +48h) */}
            {[-24, -12, 0, 12, 24, 36, 48].map((relH) => {
              const idx = aqPoints.findIndex((p) => p.h === relH);
              if (idx < 0) return null;
              const x = getV4X(idx);
              return (
                <text
                  key={relH}
                  x={x}
                  y={v4Height - 8}
                  textAnchor="middle"
                  fontSize="10.5"
                  className="font-mono fill-[#B6FFCC]"
                >
                  {relH === 0 ? 'Now' : relH > 0 ? `+${relH}h` : `${relH}h`}
                </text>
              );
            })}
          </svg>
        </div>

        {/* One-line Strip Below: Current PM2.5, PM10, Temperature, Relative Humidity, and Server-Computed AQI Chip */}
        <div className="border border-[#12612F] bg-[#061C0E] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span>
              <span className="text-[#2FBF63]">PM2.5:</span>{' '}
              <strong className="text-[#B6FFCC]">{currentPm25} &micro;g/m&sup3;</strong>
            </span>
            <span className="text-[#12612F]">|</span>
            <span>
              <span className="text-[#2FBF63]">PM10:</span>{' '}
              <strong className="text-[#B6FFCC]">{currentPm10} &micro;g/m&sup3;</strong>
            </span>
            <span className="text-[#12612F]">|</span>
            <span>
              <span className="text-[#2FBF63]">TEMP:</span>{' '}
              <strong className="text-[#B6FFCC]">{currentTemp} &deg;C</strong>
            </span>
            <span className="text-[#12612F]">|</span>
            <span>
              <span className="text-[#2FBF63]">HUMIDITY:</span>{' '}
              <strong className="text-[#B6FFCC]">{currentHumidity}%</strong>
            </span>
          </div>

          {/* AQI Chip with category computed on the server from the same CPCB bins */}
          <span className="px-2.5 py-0.5 border border-[#4CFF8A] bg-[#04130A] text-[#B6FFCC] font-bold">
            AQI {aqiValue} &bull; {aqiCategory}
          </span>
        </div>
      </section>

      {/* 6. Action Row: Open What-If Sandbox (Primary Button); Generate Patient Report (Secondary, Collapsed by Default) */}
      <section aria-label="Next clinical actions" className="space-y-3">
        <div className="border border-[#12612F] bg-[#061C0E] p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold uppercase text-[#B6FFCC]">
              Next Step: Evaluate Preventative Counterfactuals
            </div>
            <p className="text-xs text-[#2FBF63]">
              Test how staying indoors, wearing an N95 mask, or increasing controller adherence changes the 48-hour risk curve.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleToggleAndGenerateReport}
              aria-expanded={isReportExpanded}
              className="h-10 px-4 text-xs font-mono uppercase tracking-wider font-semibold border border-[#12612F] bg-[#04130A] text-[#B6FFCC] hover:border-[#4CFF8A] hover:text-[#4CFF8A] transition-colors cursor-pointer"
            >
              {isReportExpanded ? 'Hide Patient Report' : 'Generate Patient Report'}
            </button>

            <Link
              href={`/patients/${patient.id}/what-if`}
              className="h-10 px-5 text-xs font-mono uppercase tracking-wider font-bold border border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05] hover:opacity-90 transition-opacity flex items-center justify-center"
            >
              Open What-If Sandbox &rarr;
            </Link>
          </div>
        </div>

        {/* Collapsible Secondary Patient Copilot Report */}
        {isReportExpanded && (
          <div
            aria-live="polite"
            className="border border-[#12612F] bg-[#04130A] p-4 sm:p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#12612F]/40 pb-2.5">
              <div>
                <h3 className="text-sm font-semibold text-[#B6FFCC] uppercase tracking-wider">
                  Patient Copilot Draft Report
                </h3>
                <p className="text-[11px] text-[#2FBF63]">
                  Secondary AI-assisted summary grounded in the forecast payload for clinician review.
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleAndGenerateReport}
                className="text-[11px] font-mono text-[#2FBF63] hover:text-[#B6FFCC] cursor-pointer"
              >
                [Collapse &times;]
              </button>
            </div>

            {isGeneratingReport && (
              <div className="py-4 font-mono text-[#4CFF8A]">
                Generating patient report from forecast payload...
              </div>
            )}

            {copilotError && (
              <p role="alert" className="border border-[#FF2A1A]/60 bg-[#1B0806] p-3 text-[#FF9A8F]">
                {copilotError}
              </p>
            )}

            {copilotReport && (
              <div className="space-y-3 text-[#B6FFCC]">
                <p className="text-sm leading-relaxed">{copilotReport.summary_reason}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="font-mono uppercase text-[#4CFF8A] font-semibold mb-1">
                      Precautions
                    </div>
                    <ul className="list-disc pl-4 space-y-1">
                      {copilotReport.precautions.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="font-mono uppercase text-[#4CFF8A] font-semibold mb-1">
                      Recorded Triggers
                    </div>
                    <ul className="list-disc pl-4 space-y-1">
                      {copilotReport.triggers_to_avoid.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="border-t border-[#12612F]/40 pt-2 text-[11px] text-[#2FBF63]">
                  <strong className="text-[#4CFF8A]">Medication note:</strong>{' '}
                  {copilotReport.medication_guidance.action} {copilotReport.medication_guidance.note}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
