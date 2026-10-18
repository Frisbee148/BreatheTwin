'use client';

import React, { useState, useEffect } from 'react';
import { PATIENTS, Patient } from '@/lib/data';
import {
  getPatient,
  getStoredCustomPatients,
  simulateClinicalOutlier,
  adaptOutlierModel,
  getModelAdaptationStatus,
  ClinicalOutlierSimulationResponse,
  ModelAdaptationSummary,
  AdaptationStatusResponse,
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

  const [epochs, setEpochs] = useState<number>(14);
  const [ewcLambda, setEwcLambda] = useState<number>(85);

  useEffect(() => {
    let mounted = true;
    getPatient(patientId).then((liveP) => {
      if (mounted && liveP) setPatient(liveP);
    });
    getModelAdaptationStatus().then((st) => {
      if (mounted && st) setAdaptStatus(st);
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
        if (mounted) setSimResult(res);
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
    } finally {
      setIsSimulating(false);
    }
  };

  const handleTriggerAdaptation = async () => {
    if (!noteText.trim()) return;
    setIsAdapting(true);
    try {
      const summary = await adaptOutlierModel(patientId, noteText, epochs, ewcLambda);
      setAdaptationResult(summary);
      if (summary.updatedSimulation) {
        setSimResult(summary.updatedSimulation);
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
      <div className="border border-[#12612F] bg-[#04130A] p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#2FBF63]">
            [MODULE 05] PLAIN-TEXT CLINICAL FEATURE INGESTION &amp; CONTINUAL MODEL ADAPTATION
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-[#B6FFCC] font-mono mt-0.5">
            OUTLIER SYMPTOM TRANSLATOR &amp; DIGITAL TWIN RE-SIMULATION STUDIO
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="border border-[#12612F] bg-[#061C0E] px-3 py-1.5">
            <span className="text-[#2FBF63] mr-2">ACTIVE CHECKPOINT:</span>
            <span className="text-[#4CFF8A] font-bold">{activeModelVersion}</span>
          </div>
          <div className="border border-[#12612F] bg-[#061C0E] px-3 py-1.5">
            <span className="text-[#2FBF63] mr-2">OUTLIER REPLAY BUFFER:</span>
            <span className="text-[#B6FFCC] font-bold">
              {adaptStatus?.outlierBufferCount ?? (adaptationResult ? adaptationResult.outlierCasesCount : 0)} CASES
            </span>
          </div>
          <div className="border border-[#12612F] bg-[#061C0E] px-3 py-1.5">
            <span className="text-[#2FBF63] mr-2">SAFETY GATE:</span>
            <span className="text-[#4CFF8A] font-bold">EWC + BRIER CALIBRATION</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Grid: Left = Plain-Text Input + Presets + Retraining Controls, Right = Live Twin Re-Simulation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 cols): Clinical Note Input & Continual Learning Controls */}
        <div className="lg:col-span-5 space-y-6">
          <div className="border border-[#12612F] bg-[#04130A] p-5">
            <div className="flex items-center justify-between border-b border-[#12612F]/60 pb-3 mb-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-[#2FBF63]">
                  STEP 1 // NATURAL LANGUAGE CLINICAL INPUT
                </div>
                <h2 className="text-sm font-bold text-[#B6FFCC] font-mono">
                  ENTER OUTLIER CONDITION OR SYMPTOM NOTE
                </h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 border border-[#2FBF63] text-[#4CFF8A] bg-[#061C0E]">
                LLM &rarr; 9 DERIVED FEATURES
              </span>
            </div>

            {/* Quick Presets */}
            <div className="mb-4">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#2FBF63] mb-2">
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
                          ? 'bg-[#0E793C] text-white border-[#4CFF8A] font-semibold'
                          : 'bg-[#061C0E] text-[#B6FFCC] border-[#12612F] hover:border-[#2FBF63]'
                      }`}
                    >
                      <span>{preset.label}</span>
                      <span className="ml-1.5 text-[9px] opacity-80">[{preset.badge}]</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Free-Text Clinical Note Box */}
            <div className="mb-4">
              <label
                htmlFor="clinical-outlier-note"
                className="block text-[10px] font-mono uppercase tracking-wider text-[#2FBF63] mb-1.5"
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
                className="w-full bg-[#061C0E] border border-[#12612F] focus:border-[#4CFF8A] text-[#B6FFCC] p-3 text-xs font-mono focus:outline-none"
              />
              <div className="flex justify-between text-[10px] font-mono text-[#2FBF63] mt-1">
                <span>Supports free-text diseases, vitals (e.g. 103°F, 115 bpm), &amp; drug triggers</span>
                <span>{noteText.length} chars</span>
              </div>
            </div>

            {/* Fast-Loop Action Button */}
            <button
              type="button"
              onClick={() => handleRunSimulation()}
              disabled={isSimulating || !noteText.trim()}
              className="w-full py-2.5 px-4 bg-[#0E793C] hover:bg-[#2FBF63] hover:text-black text-white font-mono text-xs font-bold uppercase tracking-wider border border-[#4CFF8A] transition-all cursor-pointer disabled:opacity-50"
            >
              {isSimulating
                ? '> EXTRACTING FEATURES & RE-RUNNING ENSEMBLE...'
                : '[FAST LOOP] CONVERT TEXT TO FEATURES & RE-RUN DIGITAL TWIN'}
            </button>
          </div>

          {/* Step 2: Continual Model Retraining & EWC Adaptation Box */}
          <div className="border border-[#12612F] bg-[#04130A] p-5">
            <div className="flex items-center justify-between border-b border-[#12612F]/60 pb-3 mb-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-[#2FBF63]">
                  STEP 2 // CONTINUAL LEARNING &amp; MODEL RETRAINING
                </div>
                <h2 className="text-sm font-bold text-[#B6FFCC] font-mono">
                  ADAPT STAGE-2 META-LEARNER WITH EWC GUARDRAILS
                </h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 border border-[#12612F] text-[#2FBF63] bg-[#061C0E]">
                SLOW LOOP
              </span>
            </div>

            <p className="text-xs text-[#2FBF63] mb-4 leading-relaxed">
              Commits this outlier case to the Experience Replay Buffer, synthesizes{' '}
              <span className="text-[#B6FFCC] font-mono">K=24</span> mechanistic 240h trajectory rollouts, and
              fine-tunes the <span className="text-[#B6FFCC] font-mono">RespiTwinMLPMetaLearner</span> using{' '}
              <strong className="text-[#4CFF8A]">Elastic Weight Consolidation (EWC)</strong> to prevent catastrophic
              forgetting.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4 text-xs font-mono">
              <div className="bg-[#061C0E] border border-[#12612F] p-2.5">
                <label htmlFor="adapt-epochs" className="block text-[10px] text-[#2FBF63] mb-1">
                  FINE-TUNING EPOCHS: <span className="text-[#4CFF8A]">{epochs}</span>
                </label>
                <input
                  id="adapt-epochs"
                  type="range"
                  min={6}
                  max={30}
                  value={epochs}
                  onChange={(e) => setEpochs(Number(e.target.value))}
                  className="w-full accent-[#4CFF8A]"
                />
              </div>
              <div className="bg-[#061C0E] border border-[#12612F] p-2.5">
                <label htmlFor="adapt-ewc" className="block text-[10px] text-[#2FBF63] mb-1">
                  EWC ANCHOR LAMBDA (λ): <span className="text-[#4CFF8A]">{ewcLambda}</span>
                </label>
                <input
                  id="adapt-ewc"
                  type="range"
                  min={20}
                  max={200}
                  step={5}
                  value={ewcLambda}
                  onChange={(e) => setEwcLambda(Number(e.target.value))}
                  className="w-full accent-[#4CFF8A]"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleTriggerAdaptation}
              disabled={isAdapting || !noteText.trim()}
              className="w-full py-2.5 px-4 bg-[#061C0E] hover:bg-[#0E793C] text-[#4CFF8A] hover:text-white font-mono text-xs font-bold uppercase tracking-wider border border-[#4CFF8A] transition-all cursor-pointer disabled:opacity-50"
            >
              {isAdapting
                ? '> SYNTHESIZING TRAJECTORIES & RETRAINING MODEL...'
                : '[SLOW LOOP] COMMIT OUTLIER & RETRAIN / HOT-SWAP MODEL'}
            </button>

            {/* Retraining Result Banner */}
            {adaptationResult && (
              <div className="mt-4 border border-[#4CFF8A] bg-[#061C0E] p-3.5 text-xs font-mono space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#4CFF8A] font-bold">
                    ✓ MODEL ADAPTED &amp; HOT-SWAPPED ({adaptationResult.adaptationId})
                  </span>
                  <span className="px-2 py-0.5 bg-[#0E793C] text-white text-[10px]">
                    {adaptationResult.modelVersion}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div>
                    <div className="text-[#2FBF63] text-[9px]">LOSS REDUCTION</div>
                    <div className="text-[#B6FFCC]">
                      {adaptationResult.initialLoss.toFixed(3)} &rarr; {adaptationResult.finalLoss.toFixed(3)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#2FBF63] text-[9px]">BRIER CALIBRATION</div>
                    <div className="text-[#4CFF8A]">{adaptationResult.brierCalibrationScore} (PASS)</div>
                  </div>
                  <div>
                    <div className="text-[#2FBF63] text-[9px]">SYNTHETIC ROLLOUTS</div>
                    <div className="text-[#B6FFCC]">
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
              <div className="border border-[#12612F] bg-[#04130A] p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/60 pb-3 mb-3">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-[#2FBF63]">
                      LLM EXTRACTED CLINICAL CONCEPT &amp; PATHOPHYSIOLOGY
                    </div>
                    <div className="text-base font-bold text-[#4CFF8A] font-mono mt-0.5">
                      {simResult.extraction.primary_condition}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="px-2 py-0.5 border border-[#12612F] bg-[#061C0E] text-[#B6FFCC]">
                      ICD-10: {simResult.extraction.icd10_code}
                    </span>
                    <span className="px-2 py-0.5 border border-[#2FBF63] bg-[#0E793C]/30 text-[#4CFF8A]">
                      SEVERITY: {simResult.extraction.severity_tier.toUpperCase()}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-[#B6FFCC] mb-2 leading-relaxed">
                  {simResult.extraction.clinical_summary}
                </p>
                <p className="text-[11px] text-[#2FBF63] mb-3 leading-relaxed">
                  <strong className="text-[#B6FFCC]">Mechanistic Coupling:</strong>{' '}
                  {simResult.extraction.pathophysiological_mechanism}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {simResult.extraction.extracted_symptoms.map((sym, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-mono px-2 py-0.5 bg-[#061C0E] border border-[#12612F] text-[#4CFF8A]"
                    >
                      + {sym}
                    </span>
                  ))}
                </div>
              </div>

              {/* Side-by-Side Digital Twin Output Comparison */}
              <div className="border border-[#12612F] bg-[#04130A] p-5">
                <div className="flex items-center justify-between border-b border-[#12612F]/60 pb-3 mb-4">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-[#2FBF63]">
                      RE-SCORED MULTIMODAL ENSEMBLE OUTPUT (TCN + XGBOOST &rarr; MLP META-LEARNER)
                    </div>
                    <h2 className="text-sm font-bold text-[#B6FFCC] font-mono">
                      BASELINE DIGITAL TWIN VS. OUTLIER-ADAPTED DIGITAL TWIN
                    </h2>
                  </div>
                  <StatusChip status={simResult.adapted.riskLevel as any} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                  {/* 48h Risk Comparison */}
                  <div className="border border-[#12612F] bg-[#061C0E] p-3.5">
                    <div className="text-[10px] font-mono uppercase text-[#2FBF63]">48-HOUR FLARE-UP RISK</div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-sm font-mono text-[#2FBF63] line-through">
                        {simResult.baseline.risk48h}%
                      </span>
                      <span className="text-2xl font-bold font-mono text-[#4CFF8A]">
                        {simResult.adapted.risk48h}%
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[#FF6B6B] mt-1">
                      {simResult.deltas.risk48hDelta >= 0 ? '+' : ''}
                      {simResult.deltas.risk48hDelta}% RISK SURGE
                    </div>
                  </div>

                  {/* 24h Risk Comparison */}
                  <div className="border border-[#12612F] bg-[#061C0E] p-3.5">
                    <div className="text-[10px] font-mono uppercase text-[#2FBF63]">24-HOUR FLARE-UP RISK</div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-sm font-mono text-[#2FBF63] line-through">
                        {simResult.baseline.risk24h}%
                      </span>
                      <span className="text-2xl font-bold font-mono text-[#B6FFCC]">
                        {simResult.adapted.risk24h}%
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[#FF6B6B] mt-1">
                      {simResult.deltas.risk24hDelta >= 0 ? '+' : ''}
                      {simResult.deltas.risk24hDelta}% IMMEDIATE SHIFT
                    </div>
                  </div>

                  {/* Latent Airway Inflammation ODE Comparison */}
                  <div className="border border-[#12612F] bg-[#061C0E] p-3.5">
                    <div className="text-[10px] font-mono uppercase text-[#2FBF63]">
                      LATENT INFLAMMATION I(t)
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-sm font-mono text-[#2FBF63] line-through">
                        {simResult.baseline.inflammation.toFixed(2)}
                      </span>
                      <span className="text-2xl font-bold font-mono text-[#4CFF8A]">
                        {simResult.adapted.inflammation.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[#FF6B6B] mt-1">
                      +{simResult.deltas.inflammationDelta.toFixed(2)} ODE CYTOKINE DRIVE
                    </div>
                  </div>
                </div>

                {/* 48-Hour Comparative Trajectory SVG Chart */}
                <div className="border border-[#12612F]/70 bg-[#030D07] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-[11px] font-mono">
                    <span className="text-[#B6FFCC] font-semibold">
                      48-HOUR RISK TRAJECTORY: BASELINE VS. OUTLIER-ADAPTED TWIN
                    </span>
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5 text-[#2FBF63]">
                        <span className="inline-block w-3 h-0.5 bg-[#2FBF63]" /> Baseline Twin
                      </span>
                      <span className="flex items-center gap-1.5 text-[#FF6B6B]">
                        <span className="inline-block w-3 h-0.5 bg-[#FF6B6B]" /> Outlier-Adapted Twin
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
                            stroke="#12612F"
                            strokeDasharray="3 3"
                            strokeWidth="0.6"
                          />
                          <text x={4} y={y + 3} fill="#2FBF63" fontSize="9" fontFamily="monospace">
                            {val}%
                          </text>
                        </g>
                      );
                    })}

                    {/* Baseline Polyline */}
                    <polyline
                      fill="none"
                      stroke="#2FBF63"
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
                      stroke="#FF6B6B"
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
                          fill="#2FBF63"
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
        <div className="border border-[#12612F] bg-[#04130A] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/60 pb-3 mb-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#2FBF63]">
                MULTI-FEATURE CASCADE // LLM-DERIVED BIOMARKER &amp; ODE PERTURBATIONS
              </div>
              <h2 className="text-sm font-bold text-[#B6FFCC] font-mono">
                CALCULATED FEATURE DELTAS FED INTO TCN + XGBOOST + MECHANISTIC ODE ({simResult.derivedFeatures.length}{' '}
                FEATURES)
              </h2>
            </div>
            <span className="text-[11px] font-mono text-[#2FBF63]">
              SOURCE: {simResult.extraction.extraction_source.toUpperCase()}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-[#12612F] text-[10px] text-[#2FBF63] uppercase">
                  <th className="py-2 px-3">Feature / Biomarker</th>
                  <th className="py-2 px-3">Model Layer</th>
                  <th className="py-2 px-3">Baseline Value</th>
                  <th className="py-2 px-3">Derived Outlier Value</th>
                  <th className="py-2 px-3">Calculated Delta</th>
                  <th className="py-2 px-3">Physiological Mechanism &amp; Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#12612F]/40">
                {simResult.derivedFeatures.map((feat) => (
                  <tr key={feat.featureKey} className="hover:bg-[#061C0E]/60">
                    <td className="py-2.5 px-3 font-semibold text-[#B6FFCC]">{feat.featureName}</td>
                    <td className="py-2.5 px-3">
                      <span className="text-[10px] px-2 py-0.5 border border-[#12612F] bg-[#061C0E] text-[#4CFF8A]">
                        {feat.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#2FBF63]">{feat.baselineValue}</td>
                    <td className="py-2.5 px-3 text-[#4CFF8A] font-bold">{feat.derivedValue}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 bg-[#0E793C]/40 border border-[#2FBF63] text-[#B6FFCC]">
                        {feat.deltaDisplay}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#2FBF63] font-sans text-xs">
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
