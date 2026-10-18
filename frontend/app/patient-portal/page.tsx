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
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    lockedPatientId || queryPatientId || 'PT-8821'
  );

  // Sync URL query param if present for doctor
  useEffect(() => {
    if (session.role === 'doctor' && queryPatientId && queryPatientId !== selectedPatientId) {
      setSelectedPatientId(queryPatientId);
    }
  }, [session.role, queryPatientId, selectedPatientId]);

  const activePatientId = lockedPatientId || selectedPatientId;

  const [patient, setPatient] = useState<Patient>(
    PATIENTS.find((p) => p.id === activePatientId) || PATIENTS[0]
  );

  // Non-Medication What-If Toggles (Patients cannot change medication!)
  const [stayIndoorsEvening, setStayIndoorsEvening] = useState<boolean>(true);
  const [wearMaskOutdoors, setWearMaskOutdoors] = useState<boolean>(false);
  const [useBedroomPurifier, setUseBedroomPurifier] = useState<boolean>(false);
  const [whatIfBand, setWhatIfBand] = useState<PlainRiskBand>('Watch');
  const [isSimulatingWhatIf, setIsSimulatingWhatIf] = useState<boolean>(false);

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
    setLogSuccessMessage(null);
    setIsCopilotReportLoading(true);
    setCopilotReportError(null);

    // Immediately synchronize local patient data so UI matches activePatientId instantly
    const localMatch = PATIENTS.find((p) => p.id === activePatientId);
    if (localMatch) {
      setPatient(localMatch);
    }

    Promise.all([
      getPatient(activePatientId),
      getPatientCheckIns(activePatientId),
      getPatientCopilotReport(activePatientId),
    ]).then(([livePatient, checkInsData, reportData]) => {
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
    }).catch((err) => {
      if (isMounted) {
        setCopilotReportError(err instanceof Error ? err.message : 'Failed to load copilot report');
      }
    }).finally(() => {
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

  // Synthesize Today's Plain-Language Short Reason
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
    setIsSimulatingWhatIf(true);

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
        // Ensure clear plain-language step-down when non-medication protections are active
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

  // 48-Hour Simple Outlook Strip Data (Next to Air-Quality Forecast, No Raw Probabilities)
  const outlook48hStrip = useMemo(() => {
    const aqi = patient.currentAirQuality.aqi;
    const isHigh = todayPlainRisk === 'High';
    const isWatch = todayPlainRisk === 'Watch';

    return [
      {
        window: 'This Afternoon',
        hours: 'Next 8h',
        riskBand: isHigh ? ('Watch' as PlainRiskBand) : ('Low' as PlainRiskBand),
        airForecast: aqi >= 200 ? 'Moderate Haze' : 'Fair Air',
        note: 'Afternoon sunlight helps disperse ground smog',
      },
      {
        window: 'Tonight',
        hours: '8h – 16h',
        riskBand: isHigh ? ('High' as PlainRiskBand) : isWatch ? ('Watch' as PlainRiskBand) : ('Low' as PlainRiskBand),
        airForecast: aqi >= 200 ? 'Poor Air (Smog Peak)' : 'Moderate Air',
        note: 'Risk likely to rise as evening traffic fumes settle',
      },
      {
        window: 'Tomorrow Morning',
        hours: '16h – 24h',
        riskBand: isHigh ? ('High' as PlainRiskBand) : isWatch ? ('Watch' as PlainRiskBand) : ('Low' as PlainRiskBand),
        airForecast: aqi >= 200 ? 'Very Poor Air' : 'Hazy Morning',
        note: 'Cool morning air traps fine dust near the ground',
      },
      {
        window: 'Tomorrow Afternoon',
        hours: '24h – 32h',
        riskBand: isHigh ? ('Watch' as PlainRiskBand) : ('Low' as PlainRiskBand),
        airForecast: 'Cleaner Window',
        note: 'Best window for brief outdoor errands',
      },
      {
        window: 'Tomorrow Night',
        hours: '32h – 40h',
        riskBand: isHigh ? ('High' as PlainRiskBand) : isWatch ? ('Watch' as PlainRiskBand) : ('Low' as PlainRiskBand),
        airForecast: aqi >= 200 ? 'Poor Evening Air' : 'Moderate Haze',
        note: 'Stay indoors to protect overnight breathing',
      },
      {
        window: 'Day 2 Outlook',
        hours: '40h – 48h',
        riskBand: isHigh ? ('Watch' as PlainRiskBand) : ('Low' as PlainRiskBand),
        airForecast: aqi >= 200 ? 'Moderate – Poor' : 'Good – Fair',
        note: 'Steadies if indoor air stays clean',
      },
    ];
  }, [patient.currentAirQuality.aqi, todayPlainRisk]);

  // Simplified Personal Signals ("Normal for you" vs "Different from your usual")
  const simplifiedSignals = useMemo(() => {
    const rrDiff = patient.currentTelemetry.rr - patient.baselineRR;
    const spo2Low = patient.currentTelemetry.spo2 < 94.0;
    const sleepRestless =
      patient.currentTelemetry.sleepAwakenings >= 3 ||
      patient.currentTelemetry.deepSleepPercent < 13;

    return [
      {
        name: 'Resting Breathing Rate',
        comparison: rrDiff >= 2.0 ? 'Different from your usual' : 'Normal for you',
        isDifferent: rrDiff >= 2.0,
        plainSummary:
          rrDiff >= 2.0
            ? 'Your breathing at rest and during the night has been a little faster than your usual pace.'
            : 'Your resting breathing pace is steady and matches your usual personal rhythm.',
      },
      {
        name: 'Oxygen Level',
        comparison: spo2Low ? 'Different from your usual' : 'Normal for you',
        isDifferent: spo2Low,
        plainSummary: spo2Low
          ? 'Your overnight oxygen dipped slightly below your usual comfortable range during sleep.'
          : 'Your oxygen level has stayed right in your normal personal range day and night.',
      },
      {
        name: 'Sleep Quality',
        comparison: sleepRestless ? 'Different from your usual' : 'Normal for you',
        isDifferent: sleepRestless,
        plainSummary: sleepRestless
          ? 'Your sleep was more restless than your usual last night, with a few brief awakenings.'
          : 'You slept smoothly through the night with your usual restful sleep pattern.',
      },
    ];
  }, [patient]);

  // Fixed, Doctor-Approved Set of Suggested Actions
  const doctorApprovedActions = [
    {
      id: 'limit-outdoors',
      title: 'Limit time outdoors',
      whyItHelps:
        'Reduces how much smoky air and fine road dust your lungs breathe in during peak pollution hours, keeping airway swelling down.',
      badge: 'DOCTOR-APPROVED',
    },
    {
      id: 'wear-mask',
      title: 'Wear a mask (N95)',
      whyItHelps:
        'A snug N95 mask filters out most fine dust and traffic smoke particles whenever you have to commute or step outside.',
      badge: 'DOCTOR-APPROVED',
    },
    {
      id: 'rescue-inhaler',
      title: 'Keep your rescue inhaler with you',
      whyItHelps:
        'Gives you quick relief right away if you feel sudden chest tightness, coughing, or shortness of breath while away from home.',
      badge: 'DOCTOR-APPROVED',
    },
    {
      id: 'follow-plan',
      title: 'Follow your asthma action plan',
      whyItHelps:
        'Taking your daily prescribed controller medication on schedule calms sensitive airways and helps prevent flare-ups before they start.',
      badge: 'DOCTOR-APPROVED',
    },
  ];

  // Build plain-language What-If sentence
  const whatIfSentence = useMemo(() => {
    const chosen: string[] = [];
    if (stayIndoorsEvening) chosen.push('stay indoors this evening');
    if (wearMaskOutdoors) chosen.push('wear an N95 mask when stepping out');
    if (useBedroomPurifier) chosen.push('run your bedroom air purifier tonight');

    if (chosen.length === 0) {
      return `If you keep your usual outdoor routine tonight without extra air protection, your risk stays at ${todayPlainRisk}.`;
    }

    const actionPhrase =
      chosen.length === 1
        ? chosen[0]
        : chosen.length === 2
        ? `${chosen[0]} and ${chosen[1]}`
        : `${chosen[0]}, ${chosen[1]}, and ${chosen[2]}`;

    if (todayPlainRisk === whatIfBand) {
      return `If you ${actionPhrase}, your risk stays steady at ${whatIfBand} and your airways remain protected against evening smog.`;
    }
    return `If you ${actionPhrase}, your risk drops from ${todayPlainRisk} to ${whatIfBand}.`;
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
      setLogSuccessMessage(
        'Check-in saved! Your digital twin has updated your personal log for today.'
      );
    } finally {
      setIsSubmittingLog(false);
    }
  };

  const getBandBadgeClasses = (band: PlainRiskBand) => {
    if (band === 'High') {
      return 'border-[#FF2A1A] bg-[#FF2A1A]/15 text-[#FF2A1A]';
    }
    if (band === 'Watch') {
      return 'border-[#FFE14A] bg-[#FFE14A]/15 text-[#FFE14A]';
    }
    return 'border-[#4CFF8A] bg-[#4CFF8A]/15 text-[#4CFF8A]';
  };

  return (
    <div className="space-y-6 pb-12">
      {/* =========================================================================
          TOP ROLE CONTEXT BAR (SHOWS PATIENT ISOLATION OR DOCTOR PREVIEW)
      ========================================================================= */}
      <div className="border border-[#12612F] bg-[#04130A] p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center space-x-3">
          <span className="px-2.5 py-1 font-mono font-bold uppercase border border-[#4CFF8A] bg-[#061C0E] text-[#4CFF8A]">
            {session.role === 'patient' ? 'PATIENT PERSONAL PORTAL' : 'DOCTOR PREVIEW OF PATIENT PORTAL'}
          </span>
          <div>
            <span className="font-bold text-[#B6FFCC] text-sm">{patient.name}</span>
            <span className="text-[#2FBF63] font-mono ml-2">
              ({patient.id} • {patient.city})
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {session.role === 'doctor' ? (
            <>
              <label htmlFor="portal-patient-switcher" className="text-[11px] font-mono uppercase text-[#2FBF63]">
                PREVIEW PATIENT:
              </label>
              <select
                id="portal-patient-switcher"
                value={activePatientId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedPatientId(nextId);
                  router.replace(`/patient-portal?patientId=${nextId}`, { scroll: false });
                }}
                className="bg-[#061C0E] border border-[#12612F] text-[#4CFF8A] px-2.5 py-1.5 text-xs font-mono"
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
                className="px-3 py-1.5 border border-[#FFE14A] text-[#FFE14A] hover:bg-[#FFE14A] hover:text-[#020A05] font-mono font-bold uppercase text-[11px] transition-colors cursor-pointer"
              >
                Lock to {patient.name.split(' ')[0]}&apos;s Login
              </button>
              <Link
                href={`/patients/${patient.id}`}
                className="px-3 py-1.5 border border-[#4CFF8A] text-[#4CFF8A] hover:bg-[#4CFF8A] hover:text-[#020A05] font-mono font-bold uppercase text-[11px] transition-colors"
              >
                Back to Doctor Twin &rarr;
              </Link>
            </>
          ) : (
            <div className="flex items-center space-x-3 font-mono text-[11px]">
              <span className="text-[#2FBF63]">
                PRIVACY GUARDRAIL: Viewing only your own record ({patient.id})
              </span>
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
          ALWAYS-VISIBLE URGENT HELP BOX (PINNED SAFETY BANNER AT TOP OF PORTAL)
      ========================================================================= */}
      <section
        aria-label="When to get urgent help"
        className="border-2 border-[#FF2A1A] bg-[#04130A] p-4 sm:p-5 shadow-sm"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 text-[11px] font-mono font-bold uppercase bg-[#FF2A1A] text-white">
                WHEN TO GET URGENT HELP
              </span>
              <span className="text-xs font-mono uppercase text-[#FF2A1A] font-semibold">
                ALWAYS VISIBLE SAFETY GUIDE
              </span>
            </div>
            <p className="text-sm font-semibold text-[#B6FFCC]">
              Get urgent medical help right away if you have any of these warning signs:
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-[#75FFA5] pt-1">
              <li className="border border-[#FF2A1A]/40 bg-[#020A05] p-2.5">
                <strong className="text-[#FF2A1A] block uppercase font-mono text-[11px]">
                  1. Trouble Speaking or Breathing
                </strong>
                You are gasping for air, cannot speak a full sentence in one breath, or feel chest/neck skin pulling in tightly.
              </li>
              <li className="border border-[#FF2A1A]/40 bg-[#020A05] p-2.5">
                <strong className="text-[#FF2A1A] block uppercase font-mono text-[11px]">
                  2. Rescue Inhaler Not Helping
                </strong>
                Your quick-relief rescue inhaler ({patient.rescueMedication}) does not ease your breathing within 15–20 minutes.
              </li>
              <li className="border border-[#FF2A1A]/40 bg-[#020A05] p-2.5">
                <strong className="text-[#FF2A1A] block uppercase font-mono text-[11px]">
                  3. Severe Warning Signs
                </strong>
                Your lips or fingernails look pale or bluish, or you feel dizzy, confused, or exhausted from breathing.
              </li>
            </ul>
          </div>

          <div className="flex sm:flex-row lg:flex-col gap-2.5 shrink-0">
            <a
              href="tel:112"
              className="px-4 py-2.5 bg-[#FF2A1A] text-white font-mono font-bold text-xs uppercase tracking-wider text-center hover:opacity-90 transition-opacity"
            >
              CALL EMERGENCY (112 / 108)
            </a>
            <a
              href="#care-plan-section"
              className="px-4 py-2 border border-[#FF2A1A] text-[#FF2A1A] font-mono font-bold text-xs uppercase tracking-wider text-center hover:bg-[#FF2A1A] hover:text-white transition-colors"
            >
              VIEW MY ACTION PLAN &darr;
            </a>
          </div>
        </div>
      </section>

      {/* =========================================================================
          MODULE 1 & MODULE 3: TODAY'S STATUS (PLAIN LANGUAGE) + AIR QUALITY NOW & LATER
      ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Module 1: Today's Status */}
        <section
          aria-labelledby="todays-status-heading"
          className="lg:col-span-6 border border-[#12612F] bg-[#04130A] p-6 flex flex-col justify-between space-y-5"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#12612F]/60 pb-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#2FBF63]">
                  {'// 01 • TODAY’S STATUS'}
                </div>
                <h1
                  id="todays-status-heading"
                  className="text-xl sm:text-2xl font-bold text-[#B6FFCC] mt-0.5"
                >
                  Your Asthma Outlook Today
                </h1>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 border border-[#12612F] text-[#2FBF63]">
                PLAIN-LANGUAGE VIEW
              </span>
            </div>

            {/* Single Plain-Language Risk Level (Low / Watch / High) */}
            <div className="border border-[#12612F] bg-[#020A05] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-[#2FBF63]">
                  TODAY’S RISK LEVEL
                </div>
                <div
                  className={`text-4xl sm:text-5xl font-bold uppercase tracking-tight mt-1 ${
                    todayPlainRisk === 'High'
                      ? 'text-[#FF2A1A]'
                      : todayPlainRisk === 'Watch'
                      ? 'text-[#FFE14A]'
                      : 'text-[#4CFF8A]'
                  }`}
                >
                  {todayPlainRisk}
                </div>
              </div>

              <div className={`px-4 py-2 border font-mono text-xs font-bold uppercase ${getBandBadgeClasses(todayPlainRisk)}`}>
                {todayPlainRisk === 'High'
                  ? '▲ HIGH — TAKE EXTRA CARE TODAY'
                  : todayPlainRisk === 'Watch'
                  ? '◆ WATCH — BE MINDFUL OF TRIGGERS'
                  : '● LOW — STEADY & CALM TODAY'}
              </div>
            </div>

            {/* Plain-language short reason */}
            <div className="space-y-1.5">
              <div className="text-xs font-mono uppercase tracking-wider text-[#2FBF63]">
                WHY YOUR STATUS IS {todayPlainRisk.toUpperCase()} TODAY:
              </div>
              <p className="text-base sm:text-lg font-medium text-[#B6FFCC] leading-relaxed border-l-2 border-[#4CFF8A] pl-4 py-1">
                &ldquo;{todayShortReason}&rdquo;
              </p>
            </div>
          </div>

          <div className="border-t border-[#12612F]/40 pt-3 flex items-center justify-between text-xs text-[#2FBF63]">
            <span>Updated from your wearable signals &amp; {patient.city} air monitor</span>
            <span className="font-mono uppercase">NO RAW PROBABILITIES</span>
          </div>
        </section>

        {/* Module 3: Air Quality Now and Later */}
        <section
          aria-labelledby="air-quality-heading"
          className="lg:col-span-6 border border-[#12612F] bg-[#04130A] p-6 flex flex-col justify-between space-y-5"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#12612F]/60 pb-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#2FBF63]">
                  {`// 02 • AIR QUALITY NOW & LATER (${patient.city.toUpperCase()})`}
                </div>
                <h2
                  id="air-quality-heading"
                  className="text-xl sm:text-2xl font-bold text-[#B6FFCC] mt-0.5"
                >
                  Outdoor Air Around You
                </h2>
              </div>
              <span className="px-2.5 py-1 text-xs font-mono font-bold border border-[#FFE14A] bg-[#020A05] text-[#FFE14A]">
                {patient.currentAirQuality.aqiCategory.toUpperCase()} AIR (AQI {patient.currentAirQuality.aqi})
              </span>
            </div>

            {/* Plain words summary of current AQI / PM2.5 */}
            <div className="border border-[#12612F] bg-[#020A05] p-4 space-y-1.5">
              <div className="text-xs font-mono uppercase text-[#2FBF63]">
                AIR QUALITY RIGHT NOW ({patient.station})
              </div>
              <p className="text-sm sm:text-base text-[#B6FFCC] leading-relaxed">
                {patient.currentAirQuality.aqi >= 300
                  ? `Outdoor air is Severe right now (AQI ${patient.currentAirQuality.aqi}, fine dust PM2.5 at ${patient.currentAirQuality.pm25} µg/m³). In plain words: the air outside is heavy with smoke and fine particles that can quickly irritate your lungs.`
                  : patient.currentAirQuality.aqi >= 200
                  ? `Outdoor air is Poor right now (AQI ${patient.currentAirQuality.aqi}, fine dust PM2.5 at ${patient.currentAirQuality.pm25} µg/m³). In plain words: there is noticeable haze and traffic dust outside that can make breathing feel tighter.`
                  : `Outdoor air is Moderate right now (AQI ${patient.currentAirQuality.aqi}, fine dust PM2.5 at ${patient.currentAirQuality.pm25} µg/m³). Sensitive airways may still notice mild irritation near busy roads.`}
              </p>
            </div>

            {/* Best and Worst Times of Day to be Outdoors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="border border-[#4CFF8A] bg-[#061C0E] p-4 space-y-1.5">
                <div className="font-mono font-bold uppercase text-[#4CFF8A] flex items-center justify-between">
                  <span>✓ BEST TIME TO BE OUTDOORS</span>
                  <span>CLEANER WINDOW</span>
                </div>
                <div className="text-base font-bold text-[#B6FFCC] font-mono">
                  2:00 PM – 4:30 PM
                </div>
                <p className="text-[#75FFA5] leading-relaxed">
                  Afternoon warmth lifts trapped ground smog. Plan short walks or errands during mid-afternoon.
                </p>
              </div>

              <div className="border border-[#FF2A1A] bg-[#020A05] p-4 space-y-1.5">
                <div className="font-mono font-bold uppercase text-[#FF2A1A] flex items-center justify-between">
                  <span>▲ WORST TIME TO BE OUTDOORS</span>
                  <span>AVOID SMOG</span>
                </div>
                <div className="text-base font-bold text-[#B6FFCC] font-mono">
                  6:30–9:30 AM &amp; 6:00–10:00 PM
                </div>
                <p className="text-[#75FFA5] leading-relaxed">
                  Cool morning and evening air traps rush-hour traffic exhaust and smoke close to the ground.
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-[#12612F]/40 pt-3 flex items-center justify-between text-xs text-[#2FBF63]">
            <span>Temp: {patient.currentAirQuality.temp}°C • Humidity: {patient.currentAirQuality.humidity}%</span>
            <span className="font-mono">SOURCE: LOCAL CPCB STATION</span>
          </div>
        </section>
      </div>

      {/* =========================================================================
          MODULE 2: THE NEXT 48 HOURS (SIMPLE OUTLOOK STRIP + AIR QUALITY FORECAST)
      ========================================================================= */}
      <section
        aria-labelledby="next-48h-heading"
        className="border border-[#12612F] bg-[#04130A] p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/60 pb-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#2FBF63]">
              {'// 03 • THE NEXT 48 HOURS'}
            </div>
            <h2 id="next-48h-heading" className="text-xl font-bold text-[#B6FFCC] mt-0.5">
              48-Hour Personal Risk &amp; Air-Quality Outlook Strip
            </h2>
            <p className="text-xs text-[#75FFA5] mt-0.5">
              Shows when your breathing risk is likely to rise side-by-side with the local air-quality forecast.
            </p>
          </div>
          <div className="flex items-center space-x-3 text-xs font-mono">
            <span className="px-2 py-0.5 border border-[#4CFF8A] text-[#4CFF8A]">LOW</span>
            <span className="px-2 py-0.5 border border-[#FFE14A] text-[#FFE14A]">WATCH</span>
            <span className="px-2 py-0.5 border border-[#FF2A1A] text-[#FF2A1A]">HIGH</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {outlook48hStrip.map((slot, idx) => (
            <div
              key={idx}
              className={`border p-3.5 flex flex-col justify-between space-y-3 bg-[#020A05] ${
                slot.riskBand === 'High'
                  ? 'border-[#FF2A1A]'
                  : slot.riskBand === 'Watch'
                  ? 'border-[#FFE14A]'
                  : 'border-[#12612F]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-[10px] font-mono text-[#2FBF63] uppercase">
                  <span>{slot.hours}</span>
                  <span>STEP {idx + 1}</span>
                </div>
                <div className="text-sm font-bold text-[#B6FFCC] mt-0.5">{slot.window}</div>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="text-[10px] font-mono uppercase text-[#2FBF63]">BREATHING RISK</div>
                  <div
                    className={`mt-0.5 inline-block px-2.5 py-0.5 text-xs font-mono font-bold uppercase border ${getBandBadgeClasses(
                      slot.riskBand
                    )}`}
                  >
                    {slot.riskBand}
                  </div>
                </div>

                <div className="border-t border-[#12612F]/40 pt-2">
                  <div className="text-[10px] font-mono uppercase text-[#2FBF63]">AIR FORECAST</div>
                  <div className="text-xs font-semibold text-[#B6FFCC] mt-0.5">
                    {slot.airForecast}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-[#75FFA5] leading-snug">{slot.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* =========================================================================
          MODULE 4 & MODULE 5: SIMPLIFIED PERSONAL SIGNALS + DOCTOR-APPROVED ACTIONS
      ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Module 4: Their Own Signals, Simplified */}
        <section
          aria-labelledby="simplified-signals-heading"
          className="lg:col-span-6 border border-[#12612F] bg-[#04130A] p-6 space-y-4"
        >
          <div className="border-b border-[#12612F]/60 pb-3">
            <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#2FBF63]">
              {'// 04 • YOUR OWN SIGNALS, SIMPLIFIED'}
            </div>
            <h2 id="simplified-signals-heading" className="text-xl font-bold text-[#B6FFCC] mt-0.5">
              How Your Body Compares to Your Usual
            </h2>
            <p className="text-xs text-[#75FFA5] mt-0.5">
              Your wearable readings compared against your own personal baseline — shown in plain words instead of medical charts.
            </p>
          </div>

          <div className="space-y-3">
            {simplifiedSignals.map((sig) => (
              <div
                key={sig.name}
                className="border border-[#12612F] bg-[#020A05] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="text-sm font-bold text-[#B6FFCC]">{sig.name}</div>
                  <p className="text-xs text-[#75FFA5] leading-relaxed">{sig.plainSummary}</p>
                </div>

                <span
                  className={`px-3 py-1.5 text-xs font-mono font-bold uppercase border shrink-0 self-start sm:self-center ${
                    sig.isDifferent
                      ? 'border-[#FFE14A] bg-[#FFE14A]/15 text-[#FFE14A]'
                      : 'border-[#4CFF8A] bg-[#4CFF8A]/15 text-[#4CFF8A]'
                  }`}
                >
                  {sig.isDifferent ? '◆ DIFFERENT FROM YOUR USUAL' : '✓ NORMAL FOR YOU'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Module 5: Suggested Actions (Fixed, Doctor-Approved Set) */}
        <section
          aria-labelledby="suggested-actions-heading"
          className="lg:col-span-6 border border-[#12612F] bg-[#04130A] p-6 space-y-4"
        >
          <div className="border-b border-[#12612F]/60 pb-3">
            <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#2FBF63]">
              {'// 05 • SUGGESTED ACTIONS (FIXED DOCTOR-APPROVED SET)'}
            </div>
            <h2 id="suggested-actions-heading" className="text-xl font-bold text-[#B6FFCC] mt-0.5">
              Steps That Help Protect Your Breathing Today
            </h2>
            <p className="text-xs text-[#75FFA5] mt-0.5">
              Selected from your doctor’s approved everyday guidance, with a clear explanation of why each step helps.
            </p>
          </div>

          <div className="space-y-3">
            {doctorApprovedActions.map((act, index) => (
              <div
                key={act.id}
                className="border border-[#12612F] bg-[#020A05] p-3.5 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-bold text-[#B6FFCC]">
                    {index + 1}. {act.title}
                  </div>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 border border-[#4CFF8A] text-[#4CFF8A]">
                    {act.badge}
                  </span>
                </div>
                <p className="text-xs text-[#75FFA5] leading-relaxed">
                  <strong className="text-[#4CFF8A]">Why it helps:</strong> {act.whyItHelps}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* =========================================================================
          MODULE 6 & MODULE 7: SIMPLE NON-MEDICATION WHAT-IF + DAILY SYMPTOM/INHALER LOG
      ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Module 6: Simple What-If (Non-Medication Only) */}
        <section
          aria-labelledby="simple-what-if-heading"
          className="lg:col-span-6 border border-[#4CFF8A] bg-[#04130A] p-6 flex flex-col justify-between space-y-5"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#12612F]/60 pb-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#2FBF63]">
                  {'// 06 • SIMPLE WHAT-IF (NON-MEDICATION ONLY)'}
                </div>
                <h2 id="simple-what-if-heading" className="text-xl font-bold text-[#B6FFCC] mt-0.5">
                  See How Everyday Choices Change Your Outlook
                </h2>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase border border-[#4CFF8A] text-[#4CFF8A]">
                NO TREATMENT CHANGES
              </span>
            </div>

            <p className="text-xs text-[#75FFA5] leading-relaxed">
              Try toggling clean-air habits below to see how your digital twin responds over the next 48 hours. Medication settings are locked to your doctor’s plan so you never have to guess or experiment with treatment.
            </p>

            {/* Non-medication toggles */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setStayIndoorsEvening((prev) => !prev)}
                className={`w-full p-3.5 border text-left flex items-center justify-between transition-colors cursor-pointer ${
                  stayIndoorsEvening
                    ? 'border-[#4CFF8A] bg-[#061C0E]'
                    : 'border-[#12612F] bg-[#020A05]'
                }`}
              >
                <div>
                  <div className="text-sm font-bold text-[#B6FFCC]">
                    Stay indoors this evening (avoid 6 PM – 10 PM smog peak)
                  </div>
                  <div className="text-xs text-[#75FFA5]">
                    Keeps you out of heavy evening traffic fumes and trapped ground haze.
                  </div>
                </div>
                <span className="font-mono text-xs font-bold px-3 py-1 border border-[#4CFF8A] text-[#4CFF8A] shrink-0 ml-3">
                  {stayIndoorsEvening ? '[ ✓ ON ]' : '[ OFF ]'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setWearMaskOutdoors((prev) => !prev)}
                className={`w-full p-3.5 border text-left flex items-center justify-between transition-colors cursor-pointer ${
                  wearMaskOutdoors
                    ? 'border-[#4CFF8A] bg-[#061C0E]'
                    : 'border-[#12612F] bg-[#020A05]'
                }`}
              >
                <div>
                  <div className="text-sm font-bold text-[#B6FFCC]">
                    Wear a fitted N95 mask when stepping outdoors
                  </div>
                  <div className="text-xs text-[#75FFA5]">
                    Blocks fine dust and smoke particles during your commute.
                  </div>
                </div>
                <span className="font-mono text-xs font-bold px-3 py-1 border border-[#4CFF8A] text-[#4CFF8A] shrink-0 ml-3">
                  {wearMaskOutdoors ? '[ ✓ ON ]' : '[ OFF ]'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setUseBedroomPurifier((prev) => !prev)}
                className={`w-full p-3.5 border text-left flex items-center justify-between transition-colors cursor-pointer ${
                  useBedroomPurifier
                    ? 'border-[#4CFF8A] bg-[#061C0E]'
                    : 'border-[#12612F] bg-[#020A05]'
                }`}
              >
                <div>
                  <div className="text-sm font-bold text-[#B6FFCC]">
                    Run bedroom air purifier tonight (or keep windows closed)
                  </div>
                  <div className="text-xs text-[#75FFA5]">
                    Gives your lungs clean indoor air while you sleep.
                  </div>
                </div>
                <span className="font-mono text-xs font-bold px-3 py-1 border border-[#4CFF8A] text-[#4CFF8A] shrink-0 ml-3">
                  {useBedroomPurifier ? '[ ✓ ON ]' : '[ OFF ]'}
                </span>
              </button>
            </div>

            {/* Plain-Language What-If Result Box */}
            <div className="border-2 border-[#4CFF8A] bg-[#020A05] p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-[#2FBF63]">
                <span>DIGITAL TWIN WHAT-IF OUTCOME</span>
                <span>{isSimulatingWhatIf ? 'UPDATING TWIN...' : 'LIVE TWIN RESULT'}</span>
              </div>
              <p className="text-base sm:text-lg font-bold text-[#B6FFCC] leading-relaxed">
                &ldquo;{whatIfSentence}&rdquo;
              </p>
              <div className="flex items-center space-x-3 pt-1 text-xs font-mono">
                <span className="text-[#2FBF63]">TODAY:</span>
                <span className={`px-2 py-0.5 border font-bold uppercase ${getBandBadgeClasses(todayPlainRisk)}`}>
                  {todayPlainRisk}
                </span>
                <span className="text-[#4CFF8A] font-bold">&rarr;</span>
                <span className="text-[#2FBF63]">WITH THIS CHOICE:</span>
                <span className={`px-2 py-0.5 border font-bold uppercase ${getBandBadgeClasses(whatIfBand)}`}>
                  {whatIfBand}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-[#12612F]/40 pt-3 text-[11px] text-[#2FBF63] font-mono">
            SAFETY RULE: Non-medication simulation only. Never change your inhaler dose without talking to your doctor.
          </div>
        </section>

        {/* Module 7: A Log (Quick Entry for Symptoms, Rescue Inhaler, Controller Meds) */}
        <section
          aria-labelledby="daily-log-heading"
          className="lg:col-span-6 border border-[#12612F] bg-[#04130A] p-6 flex flex-col justify-between space-y-4"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#12612F]/60 pb-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#2FBF63]">
                  {'// 07 • DAILY CHECK-IN LOG'}
                </div>
                <h2 id="daily-log-heading" className="text-xl font-bold text-[#B6FFCC] mt-0.5">
                  Log Your Symptoms &amp; Inhaler Use
                </h2>
                <p className="text-xs text-[#75FFA5] mt-0.5">
                  Quick daily entry so your digital twin and your doctor have an accurate picture of how you feel.
                </p>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 border border-[#12612F] text-[#4CFF8A]">
                FEEDS YOUR TWIN
              </span>
            </div>

            <form onSubmit={handleLogSubmit} className="space-y-3.5 text-xs">
              {/* 1. Did you take your controller medication? */}
              <div className="border border-[#12612F] bg-[#020A05] p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-[#B6FFCC] text-sm">
                    1. Controller Medication Today
                  </div>
                  <div className="text-[11px] text-[#75FFA5]">
                    {patient.controllerMedication}
                  </div>
                </div>
                <div className="flex items-center space-x-2 font-mono">
                  <button
                    type="button"
                    onClick={() => setControllerTaken(true)}
                    className={`px-3 py-1.5 border font-bold uppercase cursor-pointer ${
                      controllerTaken
                        ? 'border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05]'
                        : 'border-[#12612F] text-[#2FBF63]'
                    }`}
                  >
                    ✓ Yes, Taken
                  </button>
                  <button
                    type="button"
                    onClick={() => setControllerTaken(false)}
                    className={`px-3 py-1.5 border font-bold uppercase cursor-pointer ${
                      !controllerTaken
                        ? 'border-[#FFE14A] bg-[#FFE14A] text-[#020A05]'
                        : 'border-[#12612F] text-[#2FBF63]'
                    }`}
                  >
                    Not Yet
                  </button>
                </div>
              </div>

              {/* 2. Rescue Inhaler Use */}
              <div className="border border-[#12612F] bg-[#020A05] p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-[#B6FFCC] text-sm">
                    2. Rescue-Inhaler Puffs Used Today
                  </div>
                  <div className="text-[11px] text-[#75FFA5]">
                    {patient.rescueMedication}
                  </div>
                </div>
                <div className="flex items-center space-x-2 font-mono">
                  <button
                    type="button"
                    onClick={() => setRescuePuffs((p) => Math.max(0, p - 1))}
                    className="w-8 h-8 border border-[#12612F] bg-[#061C0E] text-[#4CFF8A] font-bold cursor-pointer"
                  >
                    -
                  </button>
                  <span className="px-3 py-1 border border-[#12612F] bg-[#04130A] text-sm font-bold text-[#B6FFCC] min-w-[70px] text-center">
                    {rescuePuffs} {rescuePuffs === 1 ? 'puff' : 'puffs'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRescuePuffs((p) => Math.min(20, p + 1))}
                    className="w-8 h-8 border border-[#12612F] bg-[#061C0E] text-[#4CFF8A] font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 3. Symptoms Today */}
              <div className="border border-[#12612F] bg-[#020A05] p-3 space-y-2.5">
                <div className="font-bold text-[#B6FFCC] text-sm">
                  3. How Are Your Symptoms Today?
                </div>
                {[
                  { label: 'Cough', val: coughScore, setter: setCoughScore },
                  { label: 'Wheezing', val: wheezingScore, setter: setWheezingScore },
                  { label: 'Chest Tightness', val: tightnessScore, setter: setTightnessScore },
                  { label: 'Shortness of Breath', val: breathlessnessScore, setter: setBreathlessnessScore },
                ].map((sym) => (
                  <div key={sym.label} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-[#75FFA5] font-medium">{sym.label}</span>
                    <div className="flex items-center space-x-1 font-mono text-[11px]">
                      {['None', 'Mild', 'Moderate', 'Severe'].map((lvl, idx) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => sym.setter(idx)}
                          className={`px-2 py-1 border cursor-pointer ${
                            sym.val === idx
                              ? 'border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05] font-bold'
                              : 'border-[#12612F] text-[#2FBF63]'
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Optional Note & Submit */}
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Optional note (e.g., commute dust, woke up coughing)..."
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  className="flex-1 bg-[#061C0E] border border-[#12612F] text-[#B6FFCC] px-3 py-2 text-xs font-mono"
                />
                <button
                  type="submit"
                  disabled={isSubmittingLog}
                  className="px-5 py-2.5 border border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05] font-mono font-bold text-xs uppercase tracking-wider cursor-pointer shrink-0"
                >
                  {isSubmittingLog ? 'SAVING...' : 'SAVE TODAY’S LOG'}
                </button>
              </div>

              {logSuccessMessage && (
                <div className="border border-[#4CFF8A] bg-[#061C0E] p-2.5 text-xs text-[#4CFF8A] font-mono">
                  ✓ {logSuccessMessage}
                </div>
              )}
            </form>
          </div>

          {/* Recent Check-Ins Feed */}
          <div className="border-t border-[#12612F]/40 pt-3 space-y-1.5 text-xs">
            <div className="font-mono text-[10px] uppercase text-[#2FBF63]">
              RECENT CHECK-INS SENT TO YOUR TWIN ({recentLogs.length})
            </div>
            {recentLogs.length === 0 ? (
              <p className="text-[11px] text-[#75FFA5]">
                No check-ins logged yet today. Save your first entry above to update your digital twin.
              </p>
            ) : (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {recentLogs.slice(0, 3).map((item, i) => (
                  <div
                    key={item.id || i}
                    className="flex items-center justify-between text-[11px] font-mono border border-[#12612F]/40 bg-[#020A05] px-2.5 py-1"
                  >
                    <span className="text-[#B6FFCC]">
                      Controller: {item.controller_taken ? 'Taken' : 'Missed'} • Rescue: {item.rescue_puffs}p
                    </span>
                    <span className="text-[#2FBF63]">
                      Cough: {item.cough_score}/3 • Tightness: {item.chest_tightness_score}/3
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* =========================================================================
          MODULE 8: PATIENT COPILOT REPORT (PERSONALIZED AI CLINICAL SUMMARY)
      ========================================================================= */}
      <section
        aria-labelledby="copilot-report-heading"
        className="border border-[#12612F] bg-[#04130A] p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#12612F]/60 pb-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#2FBF63]">
              {'// 08 • PATIENT COPILOT REPORT'}
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
          MODULE 9: THEIR CARE PLAN AND CONTACT
      ========================================================================= */}
      <section
        id="care-plan-section"
        aria-labelledby="care-plan-heading"
        className="border border-[#12612F] bg-[#04130A] p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/60 pb-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[#2FBF63]">
              {'// 09 • YOUR CARE PLAN & CLINIC CONTACT'}
            </div>
            <h2 id="care-plan-heading" className="text-xl font-bold text-[#B6FFCC] mt-0.5">
              Doctor’s Asthma Action Plan &amp; Next Visit
            </h2>
          </div>
          <span className="text-xs font-mono text-[#4CFF8A]">
            TREATING PHYSICIAN: DR. VIKRAM MEHTA, MD (PULMONOLOGY)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Card 1: Doctor's Daily Action Plan */}
          <div className="border border-[#12612F] bg-[#020A05] p-4 space-y-2">
            <div className="text-[10px] font-mono uppercase text-[#2FBF63] font-bold">
              DAILY CONTROLLER &amp; RELIEVER PLAN
            </div>
            <div className="text-sm font-bold text-[#B6FFCC]">
              Daily Controller: {patient.controllerMedication}
            </div>
            <div className="text-xs text-[#75FFA5]">
              Quick-Relief Rescue: {patient.rescueMedication} (keep with you for sudden symptoms).
            </div>
            <p className="text-[11px] text-[#2FBF63] pt-1 border-t border-[#12612F]/40">
              Known Triggers to Avoid: {patient.allergens.join(', ')}
            </p>
          </div>

          {/* Card 2: Next Clinic Visit */}
          <div className="border border-[#12612F] bg-[#020A05] p-4 space-y-2">
            <div className="text-[10px] font-mono uppercase text-[#2FBF63] font-bold">
              NEXT SCHEDULED CLINIC VISIT
            </div>
            <div className="text-sm font-bold text-[#B6FFCC] font-mono">
              Tuesday, Oct 27, 2026 • 10:30 AM
            </div>
            <div className="text-xs text-[#75FFA5]">
              Respiratory &amp; Pulmonology Outpatient Clinic ({patient.city} Center)
            </div>
            <p className="text-[11px] text-[#4CFF8A] pt-1 border-t border-[#12612F]/40 font-mono">
              ✓ Your daily twin logs will be shared with Dr. Mehta before your visit.
            </p>
          </div>

          {/* Card 3: Care Team Contact */}
          <div className="border border-[#12612F] bg-[#020A05] p-4 space-y-2 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase text-[#2FBF63] font-bold">
                CLINIC &amp; URGENT TRIAGE CONTACT
              </div>
              <div className="text-sm font-bold text-[#B6FFCC]">
                BreathTwin Pulmonology Care Desk
              </div>
              <div className="text-xs text-[#75FFA5] font-mono">
                Clinic Line: +91 11-2658-8821 • Emergency: 112 / 108
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <a
                href="tel:+911126588821"
                className="flex-1 py-2 border border-[#4CFF8A] text-[#4CFF8A] hover:bg-[#4CFF8A] hover:text-[#020A05] font-mono font-bold text-center uppercase text-[11px] transition-colors"
              >
                Call Clinic
              </a>
              <a
                href="tel:112"
                className="flex-1 py-2 border border-[#FF2A1A] text-[#FF2A1A] hover:bg-[#FF2A1A] hover:text-white font-mono font-bold text-center uppercase text-[11px] transition-colors"
              >
                Urgent Help (112)
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
