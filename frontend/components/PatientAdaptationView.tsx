'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { PATIENTS, Patient } from '@/lib/data';
import {
  getPatient,
  getStoredCustomPatients,
  saveStoredCustomPatient,
  simulateClinicalOutlier,
  adaptOutlierModel,
  getModelAdaptationStatus,
  getPatientCheckIns,
  ClinicalOutlierSimulationResponse,
  ModelAdaptationSummary,
  AdaptationStatusResponse,
  PatientDailyLogEntry,
} from '@/lib/api';
import PatientNavHeader from '@/components/PatientNavHeader';
import StatusChip from '@/components/StatusChip';

const CLINICAL_PRESETS = [
  {
    id: 'typhoid',
    label: 'Typhoid Fever (Salmonella Typhi)',
    badge: 'ICD-10: A01.0',
    note: 'Patient diagnosed with Typhoid fever (Salmonella Typhi) presenting with persistent 103.1°F step-ladder fever, severe dehydration, resting tachycardia 116 bpm, abdominal tenderness, and systemic lethargy.',
  },
  {
    id: 'dengue',
    label: 'Dengue Fever w/ Capillary Leak',
    badge: 'ICD-10: A97.1',
    note: 'Patient positive for NS1 Dengue antigen with 103.5°F high-grade fever, thrombocytopenia (platelets dropping), mild pleural/peribronchial fluid shift, dehydration, and exertional breathlessness.',
  },
  {
    id: 'gastro',
    label: 'Acute Infectious Gastroenteritis',
    badge: 'ICD-10: A09',
    note: 'Patient experiencing acute bacterial gastroenteritis with frequent watery diarrhea, vomiting, severe extracellular dehydration, electrolyte imbalance, and dry airways.',
  },
  {
    id: 'pneumonia',
    label: 'Lower Respiratory Co-Infection',
    badge: 'ICD-10: J18.9',
    note: 'Patient developed acute viral/bacterial lower respiratory co-infection with 102.2°F fever, productive cough, bronchial mucosal shedding, nocturnal SpO2 dips to 92%, and resting tachypnea.',
  },
  {
    id: 'betablocker',
    label: 'Beta-Blocker Exposure',
    badge: 'ICD-10: T44.7',
    note: 'Patient recently initiated non-selective oral beta-blocker (Propranolol) for migraine prophylaxis; reporting acute chest tightness, expiratory wheezing, and blunted rescue inhaler relief.',
  },
];

export default function PatientAdaptationView({
  patientId,
  initialPatient: propPatient,
}: {
  patientId: string;
  initialPatient?: Patient;
}) {
  const defaultPatient =
    propPatient ||
    PATIENTS.find((p) => p.id === patientId) ||
    getStoredCustomPatients().find((p) => p.id === patientId) ||
    PATIENTS[0];

  const [patient, setPatient] = useState<Patient>(defaultPatient);
  const [noteText, setNoteText] = useState<string>(CLINICAL_PRESETS[0].note);
  const [activePresetId, setActivePresetId] = useState<string>('typhoid');

  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isAdapting, setIsAdapting] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<ClinicalOutlierSimulationResponse | null>(null);
  const [adaptationResult, setAdaptationResult] = useState<ModelAdaptationSummary | null>(null);
  const [adaptStatus, setAdaptStatus] = useState<AdaptationStatusResponse | null>(null);

  // Patient Self-Reported Daily Notes from Patient Portal
  const [patientLogs, setPatientLogs] = useState<PatientDailyLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(true);

  // Standard Calibrated Adaptation Parameters
  const STANDARD_EPOCHS = 14;
  const STANDARD_EWC_LAMBDA = 85;

  useEffect(() => {
    let mounted = true;
    getPatient(patientId).then((liveP) => {
      if (mounted && liveP) setPatient(liveP);
    });
    getModelAdaptationStatus().then((st) => {
      if (mounted && st) setAdaptStatus(st);
    });
    getPatientCheckIns(patientId).then((res) => {
      if (mounted && res && Array.isArray(res.logs)) {
        setPatientLogs(res.logs);
      }
      if (mounted) setLoadingLogs(false);
    });
    return () => {
      mounted = false;
    };
  }, [patientId]);

  // Run initial simulation automatically on mount or patient change
  useEffect(() => {
    let mounted = true;
    setIsSimulating(true);
    simulateClinicalOutlier(patientId, noteText)
      .then((res) => {
        if (mounted && res) {
          setSimResult(res);
          if (res.adapted) {
            setPatient((prev) => {
              const updated: Patient = {
                ...prev,
                risk48h: res.adapted.risk48h,
                risk24h: res.adapted.risk24h,
                riskLevel: res.adapted.riskLevel as any,
                estimatedInflammationState: res.adapted.inflammation,
              };
              saveStoredCustomPatient(updated);
              return updated;
            });
          }
        }
      })
      .finally(() => {
        if (mounted) setIsSimulating(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const handleRunSimulation = async (customNote?: string) => {
    const targetNote = customNote !== undefined ? customNote : noteText;
    if (!targetNote.trim()) return;
    setIsSimulating(true);
    try {
      const res = await simulateClinicalOutlier(patientId, targetNote);
      setSimResult(res);
      if (res && res.adapted) {
        setPatient((prev) => {
          const updated: Patient = {
            ...prev,
            risk48h: res.adapted.risk48h,
            risk24h: res.adapted.risk24h,
            riskLevel: res.adapted.riskLevel as any,
            estimatedInflammationState: res.adapted.inflammation,
          };
          saveStoredCustomPatient(updated);
          return updated;
        });
      }
    } finally {
      setIsSimulating(false);
    }
  };

  const handleTriggerAdaptation = async () => {
    if (!noteText.trim()) return;
    setIsAdapting(true);
    try {
      const summary = await adaptOutlierModel(patientId, noteText, STANDARD_EPOCHS, STANDARD_EWC_LAMBDA);
      setAdaptationResult(summary);
      const updatedSim = summary.updatedSimulation;
      if (updatedSim) {
        setSimResult(updatedSim);
        setPatient((prev) => {
          const updated: Patient = {
            ...prev,
            risk48h: updatedSim.adapted.risk48h,
            risk24h: updatedSim.adapted.risk24h,
            riskLevel: updatedSim.adapted.riskLevel as any,
            estimatedInflammationState: updatedSim.adapted.inflammation,
          };
          saveStoredCustomPatient(updated);
          return updated;
        });
      }
      const latestStatus = await getModelAdaptationStatus();
      setAdaptStatus(latestStatus);
    } finally {
      setIsAdapting(false);
    }
  };

  const activeModelVersion =
    adaptationResult?.modelVersion ||
    simResult?.modelVersion ||
    adaptStatus?.modelVersion ||
    'v1.0.0-baseline';

  return (
    <div className="space-y-6 pb-12">
      <PatientNavHeader patient={patient} />

      {/* Top System Telemetry Strip */}
      <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm dark:shadow-none">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#0A602F] dark:text-[#2FBF63]">
            [MODULE 04] PLAIN-TEXT CLINICAL FEATURE INGESTION &amp; CONTINUAL MODEL ADAPTATION
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-[#0E2E1B] dark:text-[#B6FFCC] font-mono mt-0.5">
            OUTLIER SYMPTOM TRANSLATOR &amp; DIGITAL TWIN RE-SIMULATION STUDIO
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] px-3 py-1.5">
            <span className="text-[#0A602F] dark:text-[#2FBF63] mr-2">ACTIVE CHECKPOINT:</span>
            <span className="text-[#0E793C] dark:text-[#4CFF8A] font-bold">{activeModelVersion}</span>
          </div>
          <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] px-3 py-1.5">
            <span className="text-[#0A602F] dark:text-[#2FBF63] mr-2">OUTLIER REPLAY BUFFER:</span>
            <span className="text-[#0E2E1B] dark:text-[#B6FFCC] font-bold">
              {adaptStatus?.outlierBufferCount ?? (adaptationResult ? adaptationResult.outlierCasesCount : 0)} CASES
            </span>
          </div>
          <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] px-3 py-1.5">
            <span className="text-[#0A602F] dark:text-[#2FBF63] mr-2">SAFETY GATE:</span>
            <span className="text-[#0E793C] dark:text-[#4CFF8A] font-bold">EWC + BRIER CALIBRATION</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Grid: Left = Plain-Text Input + Presets + Retraining Controls, Right = Live Twin Re-Simulation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 cols): Clinical Note Input & Continual Learning Controls */}
        <div className="lg:col-span-5 space-y-6">
          {/* Patient Self-Reported Daily Check-in Notes from Portal */}
          <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-5 shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between border-b border-[#B4E3C5]/60 dark:border-[#12612F]/60 pb-3 mb-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-[#0A602F] dark:text-[#2FBF63]">
                  PATIENT PORTAL FEED // DAILY CHECK-INS &amp; SYMPTOMS
                </div>
                <h2 className="text-sm font-bold text-[#0E2E1B] dark:text-[#B6FFCC] font-mono">
                  PATIENT SELF-REPORTED NOTES ({patient.id})
                </h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 border border-[#B4E3C5] dark:border-[#12612F] text-[#0A602F] dark:text-[#4CFF8A] bg-[#EAF8EF] dark:bg-[#061C0E] font-semibold">
                {patientLogs.filter((l) => l.notes && l.notes.trim()).length} NOTES LOGGED
              </span>
            </div>

            {loadingLogs ? (
              <div className="text-xs font-mono text-[#0A602F] dark:text-[#2FBF63] py-2 animate-pulse">
                &gt; LOADING PATIENT PORTAL CHECK-IN STREAM...
              </div>
            ) : patientLogs.filter((l) => l.notes && l.notes.trim()).length > 0 ? (
              <div className="space-y-3">
                {patientLogs
                  .filter((l) => l.notes && l.notes.trim())
                  .slice(0, 3)
                  .map((log) => (
                    <div
                      key={log.id}
                      className="border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] p-3 text-xs font-mono"
                    >
                      <div className="flex items-center justify-between text-[10px] text-[#0A602F] dark:text-[#2FBF63] mb-1">
                        <span className="font-semibold">
                          LOGGED: {new Date(log.logged_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                        <span className="px-1.5 py-0.5 bg-[#EAF8EF] dark:bg-[#0E793C]/30 text-[#0E793C] dark:text-[#4CFF8A]">
                          Rescue: {log.rescue_puffs} puffs &bull; Adherence: {log.controller_taken ? 'Taken' : 'Missed'}
                        </span>
                      </div>
                      <div className="p-2 border-l-2 border-[#0E793C] dark:border-[#4CFF8A] bg-white dark:bg-[#04130A] my-1.5 text-xs text-[#0E2E1B] dark:text-[#B6FFCC] italic font-sans">
                        &ldquo;{log.notes}&rdquo;
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">
                          Breathlessness: {log.breathlessness_score}/3 &bull; Wheeze: {log.wheezing_score}/3
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setNoteText(log.notes!);
                            setActivePresetId('patient_log_' + log.id);
                            handleRunSimulation(log.notes!);
                          }}
                          className="px-2 py-1 bg-[#0E793C] hover:bg-[#0A602F] text-white text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                        >
                          &rarr; LOAD THIS NOTE &amp; RE-SIMULATE TWIN
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-xs font-mono text-[#4A755A] dark:text-[#2FBF63] py-2">
                <p className="mb-2">
                  No free-text symptoms logged by <strong className="text-[#0E2E1B] dark:text-[#B6FFCC]">{patient.name}</strong> in the Patient Portal yet.
                </p>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Link
                    href={`/patient-portal?patientId=${patient.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-[11px] text-[#0E793C] dark:text-[#4CFF8A] font-bold hover:underline"
                  >
                    &rarr; Open Patient Portal to submit a daily check-in
                  </Link>
                </div>
                <div className="pt-2 border-t border-[#B4E3C5]/40 dark:border-[#12612F]/40">
                  <span className="text-[10px] uppercase font-semibold text-[#0A602F] dark:text-[#2FBF63] block mb-1.5">
                    OR TEST TYPICAL PATIENT-REPORTED APP CHECK-INS:
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const sampleNote = 'Patient self-reported in app check-in: Running 103°F high fever, severe dehydration and vomiting, pulse 118 bpm, extreme body weakness, unable to keep down evening controller inhaler.';
                        setNoteText(sampleNote);
                        setActivePresetId('patient_sample_1');
                        handleRunSimulation(sampleNote);
                      }}
                      className="text-left text-[11px] font-mono p-2 border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] hover:border-[#0E793C] dark:hover:border-[#4CFF8A] text-[#0E2E1B] dark:text-[#B6FFCC] transition-all cursor-pointer"
                    >
                      &bull; &ldquo;High fever 103°F, severe dehydration, vomiting, pulse 118 bpm, missed controller&rdquo;
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const sampleNote = 'Patient self-reported in app check-in: Nocturnal wheezing and breathlessness, woke up 4 times, took 5 rescue inhaler puffs in past 8 hours with minimal relief.';
                        setNoteText(sampleNote);
                        setActivePresetId('patient_sample_2');
                        handleRunSimulation(sampleNote);
                      }}
                      className="text-left text-[11px] font-mono p-2 border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] hover:border-[#0E793C] dark:hover:border-[#4CFF8A] text-[#0E2E1B] dark:text-[#B6FFCC] transition-all cursor-pointer"
                    >
                      &bull; &ldquo;Nocturnal wheezing, 5 rescue puffs in 8h, minimal relief from albuterol&rdquo;
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-5 shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between border-b border-[#B4E3C5]/60 dark:border-[#12612F]/60 pb-3 mb-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-[#0A602F] dark:text-[#2FBF63]">
                  STEP 1 // NATURAL LANGUAGE CLINICAL INPUT
                </div>
                <h2 className="text-sm font-bold text-[#0E2E1B] dark:text-[#B6FFCC] font-mono">
                  ENTER OUTLIER CONDITION OR SYMPTOM NOTE
                </h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 border border-[#0E793C]/40 dark:border-[#2FBF63] text-[#0A602F] dark:text-[#4CFF8A] bg-[#EAF8EF] dark:bg-[#061C0E] font-semibold">
                LLM &rarr; 9 DERIVED FEATURES
              </span>
            </div>

            {/* Quick Presets */}
            <div className="mb-4">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#0A602F] dark:text-[#2FBF63] mb-2 font-semibold">
                QUICK CLINICAL OUTLIER PRESETS (CLICK TO LOAD &amp; SIMULATE):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CLINICAL_PRESETS.map((preset) => {
                  const isSelected = activePresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setActivePresetId(preset.id);
                        setNoteText(preset.note);
                        handleRunSimulation(preset.note);
                      }}
                      className={`text-left text-[11px] font-mono px-2.5 py-1.5 border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#0E793C] text-white border-[#0E793C] dark:border-[#4CFF8A] font-semibold shadow-sm'
                          : 'bg-[#F6FBF7] dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#B6FFCC] border-[#B4E3C5] dark:border-[#12612F] hover:border-[#0E793C] dark:hover:border-[#2FBF63]'
                      }`}
                    >
                      <span>{preset.label}</span>
                      <span className="ml-1.5 text-[9px] text-[#0A602F] dark:text-[#A7E8BD]">[{preset.badge}]</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Free-Text Clinical Note Box */}
            <div className="mb-4">
              <label
                htmlFor="clinical-outlier-note"
                className="block text-[10px] font-mono uppercase tracking-wider text-[#0A602F] dark:text-[#2FBF63] mb-1.5 font-semibold"
              >
                PLAIN-TEXT CLINICAL OBSERVATION / OUTLIER SYMPTOMS:
              </label>
              <textarea
                id="clinical-outlier-note"
                rows={4}
                value={noteText}
                onChange={(e) => {
                  setNoteText(e.target.value);
                  setActivePresetId('custom');
                }}
                placeholder="e.g., Patient contracted Typhoid fever with sustained 103°F fever, severe dehydration, resting tachycardia 115 bpm..."
                className="w-full bg-[#F6FBF7] dark:bg-[#061C0E] border border-[#B4E3C5] dark:border-[#12612F] focus:border-[#0E793C] dark:focus:border-[#4CFF8A] text-[#0E2E1B] dark:text-[#B6FFCC] p-3 text-xs font-mono focus:outline-none"
              />
              <div className="flex justify-between text-[10px] font-mono text-[#0A602F] dark:text-[#2FBF63] mt-1">
                <span>Supports free-text diseases, vitals (e.g. 103°F, 115 bpm), &amp; drug triggers</span>
                <span>{noteText.length} chars</span>
              </div>
            </div>

            {/* Fast-Loop Action Button */}
            <button
              type="button"
              onClick={() => handleRunSimulation()}
              disabled={isSimulating || !noteText.trim()}
              className="w-full py-2.5 px-4 bg-[#0E793C] hover:bg-[#0A602F] text-white font-mono text-xs font-bold uppercase tracking-wider border border-[#0E793C] dark:border-[#4CFF8A] transition-all cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {isSimulating
                ? '> EXTRACTING FEATURES & RE-RUNNING ENSEMBLE...'
                : '[FAST LOOP] CONVERT TEXT TO FEATURES & RE-RUN DIGITAL TWIN'}
            </button>
          </div>

          {/* Step 2: Continual Model Retraining & EWC Adaptation Box */}
          <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-5 shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between border-b border-[#B4E3C5]/60 dark:border-[#12612F]/60 pb-3 mb-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-[#0A602F] dark:text-[#2FBF63]">
                  STEP 2 // CONTINUAL LEARNING &amp; MODEL RETRAINING
                </div>
                <h2 className="text-sm font-bold text-[#0E2E1B] dark:text-[#B6FFCC] font-mono">
                  ADAPT STAGE-2 META-LEARNER WITH EWC GUARDRAILS
                </h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 border border-[#B4E3C5] dark:border-[#12612F] text-[#0A602F] dark:text-[#2FBF63] bg-[#F6FBF7] dark:bg-[#061C0E] font-semibold">
                SLOW LOOP
              </span>
            </div>

            <p className="text-xs text-[#24693D] dark:text-[#A7E8BD] mb-4 leading-relaxed font-sans">
              Commits this outlier case to the Experience Replay Buffer, synthesizes{' '}
              <span className="text-[#0E2E1B] dark:text-[#B6FFCC] font-mono font-semibold">K=24</span> mechanistic 240h trajectory rollouts, and
              fine-tunes the <span className="text-[#0E2E1B] dark:text-[#B6FFCC] font-mono font-semibold">RespiTwinMLPMetaLearner</span> using{' '}
              <strong className="text-[#0E793C] dark:text-[#4CFF8A]">Elastic Weight Consolidation (EWC)</strong> to prevent catastrophic
              forgetting.
            </p>

            {/* Standard Calibrated Retraining Guardrails */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 mb-4 bg-[#F6FBF7] dark:bg-[#061C0E] border border-[#B4E3C5] dark:border-[#12612F] text-xs font-mono">
              <div className="flex items-center gap-3">
                <div>
                  <span className="text-[10px] text-[#0A602F] dark:text-[#2FBF63] uppercase font-semibold">Fine-Tuning: </span>
                  <span className="text-[#0E793C] dark:text-[#4CFF8A] font-bold">{STANDARD_EPOCHS} Epochs</span>
                </div>
                <span className="text-[#B4E3C5] dark:text-[#12612F]">•</span>
                <div>
                  <span className="text-[10px] text-[#0A602F] dark:text-[#2FBF63] uppercase font-semibold">EWC Anchor Guardrail (λ): </span>
                  <span className="text-[#0E793C] dark:text-[#4CFF8A] font-bold">{STANDARD_EWC_LAMBDA}</span>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-[#0E793C] dark:text-[#4CFF8A] bg-[#EAF8EF] dark:bg-[#0E793C]/20 px-2 py-0.5 border border-[#0E793C]/30">
                STANDARD CALIBRATION
              </span>
            </div>

            <button
              type="button"
              onClick={handleTriggerAdaptation}
              disabled={isAdapting || !noteText.trim()}
              className="w-full py-2.5 px-4 bg-[#F6FBF7] dark:bg-[#061C0E] hover:bg-[#0E793C] dark:hover:bg-[#0E793C] text-[#0E793C] dark:text-[#4CFF8A] hover:text-white dark:hover:text-white font-mono text-xs font-bold uppercase tracking-wider border border-[#0E793C] dark:border-[#4CFF8A] transition-all cursor-pointer disabled:opacity-50"
            >
              {isAdapting
                ? '> SYNTHESIZING TRAJECTORIES & RETRAINING MODEL...'
                : '[SLOW LOOP] COMMIT OUTLIER & RETRAIN / HOT-SWAP MODEL'}
            </button>

            {/* Retraining Result Banner */}
            {adaptationResult && (
              <div className="mt-4 border border-[#0E793C] dark:border-[#4CFF8A] bg-[#EAF8EF] dark:bg-[#061C0E] p-3.5 text-xs font-mono space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#0E793C] dark:text-[#4CFF8A] font-bold">
                    ✓ MODEL ADAPTED &amp; HOT-SWAPPED ({adaptationResult.adaptationId})
                  </span>
                  <span className="px-2 py-0.5 bg-[#0E793C] text-white text-[10px] font-semibold">
                    {adaptationResult.modelVersion}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div>
                    <div className="text-[#0A602F] dark:text-[#2FBF63] text-[9px] uppercase font-semibold">LOSS REDUCTION</div>
                    <div className="text-[#0E2E1B] dark:text-[#B6FFCC] font-bold">
                      {adaptationResult.initialLoss.toFixed(3)} &rarr; {adaptationResult.finalLoss.toFixed(3)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#0A602F] dark:text-[#2FBF63] text-[9px] uppercase font-semibold">BRIER CALIBRATION</div>
                    <div className="text-[#0E793C] dark:text-[#4CFF8A] font-bold">{adaptationResult.brierCalibrationScore} (PASS)</div>
                  </div>
                  <div>
                    <div className="text-[#0A602F] dark:text-[#2FBF63] text-[9px] uppercase font-semibold">SYNTHETIC ROLLOUTS</div>
                    <div className="text-[#0E2E1B] dark:text-[#B6FFCC] font-bold">
                      {adaptationResult.syntheticTrajectoriesGenerated} + {adaptationResult.experienceReplaySamples}{' '}
                      replay
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (7 cols): Extracted Ontology, Side-by-Side Risk Output & Trajectory */}
        <div className="lg:col-span-7 space-y-6">
          {simResult && (
            <>
              {/* Extracted Clinical Entity & Pathophysiology Card */}
              <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-5 shadow-sm dark:shadow-none">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#B4E3C5]/60 dark:border-[#12612F]/60 pb-3 mb-3">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-[#0A602F] dark:text-[#2FBF63]">
                      LLM EXTRACTED CLINICAL CONCEPT &amp; PATHOPHYSIOLOGY
                    </div>
                    <div className="text-base font-bold text-[#0E793C] dark:text-[#4CFF8A] font-mono mt-0.5">
                      {simResult.extraction.primary_condition}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="px-2 py-0.5 border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#B6FFCC] font-semibold">
                      ICD-10: {simResult.extraction.icd10_code}
                    </span>
                    <span className="px-2 py-0.5 border border-[#0E793C]/40 dark:border-[#2FBF63] bg-[#EAF8EF] dark:bg-[#0E793C]/30 text-[#0E793C] dark:text-[#4CFF8A] font-semibold">
                      SEVERITY: {simResult.extraction.severity_tier.toUpperCase()}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-[#0E2E1B] dark:text-[#B6FFCC] mb-2 leading-relaxed font-sans">
                  {simResult.extraction.clinical_summary}
                </p>
                <p className="text-[11px] text-[#24693D] dark:text-[#A7E8BD] mb-3 leading-relaxed font-sans">
                  <strong className="text-[#0E2E1B] dark:text-[#B6FFCC]">Mechanistic Coupling:</strong>{' '}
                  {simResult.extraction.pathophysiological_mechanism}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {simResult.extraction.extracted_symptoms.map((sym, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-mono px-2 py-0.5 bg-[#F6FBF7] dark:bg-[#061C0E] border border-[#B4E3C5] dark:border-[#12612F] text-[#0E793C] dark:text-[#4CFF8A] font-semibold"
                    >
                      + {sym}
                    </span>
                  ))}
                </div>
              </div>

              {/* Side-by-Side Digital Twin Output Comparison */}
              <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-5 shadow-sm dark:shadow-none">
                <div className="flex items-center justify-between border-b border-[#B4E3C5]/60 dark:border-[#12612F]/60 pb-3 mb-4">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-[#0A602F] dark:text-[#2FBF63]">
                      RE-SCORED MULTIMODAL ENSEMBLE OUTPUT (TCN + XGBOOST &rarr; MLP META-LEARNER)
                    </div>
                    <h2 className="text-sm font-bold text-[#0E2E1B] dark:text-[#B6FFCC] font-mono">
                      BASELINE DIGITAL TWIN VS. OUTLIER-ADAPTED DIGITAL TWIN
                    </h2>
                  </div>
                  <StatusChip status={simResult.adapted.riskLevel as any} />
                </div>

                {/* Live Re-simulation Status Banner */}
                <div className="mb-4 p-3 bg-[#EAF7EE] dark:bg-[#0A2616] border border-[#0E793C] dark:border-[#4CFF8A] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#0E793C] dark:bg-[#4CFF8A] animate-pulse"></span>
                    <span className="text-xs font-mono font-bold text-[#0E793C] dark:text-[#4CFF8A]">
                      TWIN RE-SIMULATED:
                    </span>
                    <span className="text-xs font-mono text-[#0E2E1B] dark:text-[#B6FFCC]">
                      Baseline 48h Risk ({simResult.baseline.risk48h}%) &rarr; Outlier Risk ({simResult.adapted.risk48h}%)
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 bg-[#DC2626]/10 text-[#DC2626] dark:text-[#FF6B6B] border border-[#DC2626]/30">
                    {simResult.deltas.risk48hDelta >= 0 ? '+' : ''}{simResult.deltas.risk48hDelta}% SURGE
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                  {/* 48h Risk Comparison */}
                  <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] p-3.5">
                    <div className="text-[10px] font-mono uppercase text-[#0A602F] dark:text-[#2FBF63] font-semibold">48-HOUR FLARE-UP RISK</div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-sm font-mono text-[#527860] dark:text-[#2FBF63] line-through">
                        {simResult.baseline.risk48h}%
                      </span>
                      <span className="text-2xl font-bold font-mono text-[#0E793C] dark:text-[#4CFF8A]">
                        {simResult.adapted.risk48h}%
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[#DC2626] dark:text-[#FF6B6B] font-bold mt-1">
                      {simResult.deltas.risk48hDelta >= 0 ? '+' : ''}
                      {simResult.deltas.risk48hDelta}% RISK SURGE
                    </div>
                  </div>

                  {/* 24h Risk Comparison */}
                  <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] p-3.5">
                    <div className="text-[10px] font-mono uppercase text-[#0A602F] dark:text-[#2FBF63] font-semibold">24-HOUR FLARE-UP RISK</div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-sm font-mono text-[#527860] dark:text-[#2FBF63] line-through">
                        {simResult.baseline.risk24h}%
                      </span>
                      <span className="text-2xl font-bold font-mono text-[#0E2E1B] dark:text-[#B6FFCC]">
                        {simResult.adapted.risk24h}%
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[#DC2626] dark:text-[#FF6B6B] font-bold mt-1">
                      {simResult.deltas.risk24hDelta >= 0 ? '+' : ''}
                      {simResult.deltas.risk24hDelta}% IMMEDIATE SHIFT
                    </div>
                  </div>

                  {/* Latent Airway Inflammation ODE Comparison */}
                  <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] p-3.5">
                    <div className="text-[10px] font-mono uppercase text-[#0A602F] dark:text-[#2FBF63] font-semibold">
                      LATENT INFLAMMATION I(t)
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-sm font-mono text-[#527860] dark:text-[#2FBF63] line-through">
                        {simResult.baseline.inflammation.toFixed(2)}
                      </span>
                      <span className="text-2xl font-bold font-mono text-[#0E793C] dark:text-[#4CFF8A]">
                        {simResult.adapted.inflammation.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[#DC2626] dark:text-[#FF6B6B] font-bold mt-1">
                      +{simResult.deltas.inflammationDelta.toFixed(2)} ODE CYTOKINE DRIVE
                    </div>
                  </div>
                </div>

                {/* 48-Hour Comparative Trajectory SVG Chart */}
                <div className="border border-[#B4E3C5] dark:border-[#12612F]/70 bg-[#F8FCF9] dark:bg-[#030D07] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-[11px] font-mono">
                    <span className="text-[#0E2E1B] dark:text-[#B6FFCC] font-semibold">
                      48-HOUR RISK TRAJECTORY: BASELINE VS. OUTLIER-ADAPTED TWIN
                    </span>
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5 text-[#0A602F] dark:text-[#2FBF63] font-semibold">
                        <span className="inline-block w-3 h-0.5 bg-[#0D7A3E] dark:bg-[#2FBF63]" /> Baseline Twin
                      </span>
                      <span className="flex items-center gap-1.5 text-[#DC2626] dark:text-[#FF6B6B] font-semibold">
                        <span className="inline-block w-3 h-0.5 bg-[#DC2626] dark:bg-[#FF6B6B]" /> Outlier-Adapted Twin
                      </span>
                    </div>
                  </div>

                  <svg viewBox="0 0 600 170" className="w-full h-40 overflow-visible">
                    {[0, 25, 50, 75, 100].map((val) => {
                      const y = 145 - (val / 100) * 125;
                      return (
                        <g key={val}>
                          <line
                            x1={36}
                            y1={y}
                            x2={585}
                            y2={y}
                            stroke="currentColor"
                            className="text-[#CDE8D5] dark:text-[#12612F]"
                            strokeDasharray="3 3"
                            strokeWidth="0.8"
                          />
                          <text x={4} y={y + 3} fill="currentColor" className="text-[#236B3D] dark:text-[#2FBF63]" fontSize="9" fontFamily="monospace">
                            {val}%
                          </text>
                        </g>
                      );
                    })}

                    {/* Baseline Polyline */}
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      className="text-[#0D7A3E] dark:text-[#2FBF63]"
                      strokeWidth="2"
                      strokeDasharray="4 3"
                      points={simResult.trajectoryPoints
                        .map((pt, i) => {
                          const x = 36 + (i / (simResult.trajectoryPoints.length - 1)) * 549;
                          const y = 145 - (pt.baselineRisk / 100) * 125;
                          return `${x},${y}`;
                        })
                        .join(' ')}
                    />

                    {/* Adapted Polyline */}
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      className="text-[#DC2626] dark:text-[#FF6B6B]"
                      strokeWidth="2.5"
                      points={simResult.trajectoryPoints
                        .map((pt, i) => {
                          const x = 36 + (i / (simResult.trajectoryPoints.length - 1)) * 549;
                          const y = 145 - (pt.adaptedRisk / 100) * 125;
                          return `${x},${y}`;
                        })
                        .join(' ')}
                    />

                    {/* X-axis labels */}
                    {simResult.trajectoryPoints.map((pt, i) => {
                      if (i % 2 !== 0 && i !== simResult.trajectoryPoints.length - 1) return null;
                      const x = 36 + (i / (simResult.trajectoryPoints.length - 1)) * 549;
                      return (
                        <text
                          key={pt.hour}
                          x={x}
                          y={163}
                          textAnchor="middle"
                          fill="currentColor"
                          className="text-[#236B3D] dark:text-[#2FBF63]"
                          fontSize="9"
                          fontFamily="monospace"
                        >
                          {pt.label}
                        </text>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom Full-Width Section: Multi-Tier Derived Features Table */}
      {simResult && (
        <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-5 shadow-sm dark:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#B4E3C5]/60 dark:border-[#12612F]/60 pb-3 mb-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#0A602F] dark:text-[#2FBF63]">
                MULTI-FEATURE CASCADE // LLM-DERIVED BIOMARKER &amp; ODE PERTURBATIONS
              </div>
              <h2 className="text-sm font-bold text-[#0E2E1B] dark:text-[#B6FFCC] font-mono">
                CALCULATED FEATURE DELTAS FED INTO TCN + XGBOOST + MECHANISTIC ODE ({simResult.derivedFeatures.length}{' '}
                FEATURES)
              </h2>
            </div>
            <span className="text-[11px] font-mono text-[#0A602F] dark:text-[#2FBF63] font-semibold">
              SOURCE: {simResult.extraction.extraction_source.toUpperCase()}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-[#B4E3C5] dark:border-[#12612F] text-[10px] text-[#0A602F] dark:text-[#2FBF63] uppercase bg-[#F6FBF7] dark:bg-transparent">
                  <th className="py-2.5 px-3">Feature / Biomarker</th>
                  <th className="py-2.5 px-3">Model Layer</th>
                  <th className="py-2.5 px-3">Baseline Value</th>
                  <th className="py-2.5 px-3">Derived Outlier Value</th>
                  <th className="py-2.5 px-3">Calculated Delta</th>
                  <th className="py-2.5 px-3">Physiological Mechanism &amp; Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#B4E3C5]/50 dark:divide-[#12612F]/40">
                {simResult.derivedFeatures.map((feat) => (
                  <tr key={feat.featureKey} className="hover:bg-[#EAF8EF] dark:hover:bg-[#061C0E]/60 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-[#0E2E1B] dark:text-[#B6FFCC]">{feat.featureName}</td>
                    <td className="py-2.5 px-3">
                      <span className="text-[10px] px-2 py-0.5 border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] text-[#0E793C] dark:text-[#4CFF8A] font-semibold">
                        {feat.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#4A755A] dark:text-[#2FBF63]">{feat.baselineValue}</td>
                    <td className="py-2.5 px-3 text-[#0E793C] dark:text-[#4CFF8A] font-bold">{feat.derivedValue}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 bg-[#EAF8EF] dark:bg-[#0E793C]/40 border border-[#0E793C]/40 dark:border-[#2FBF63] text-[#0E793C] dark:text-[#B6FFCC] font-semibold">
                        {feat.deltaDisplay}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#24693D] dark:text-[#A7E8BD] font-sans text-xs">
                      {feat.physiologicalRationale}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
