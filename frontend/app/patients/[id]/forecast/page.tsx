'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PATIENTS } from '@/lib/data';
import PatientNavHeader from '@/components/PatientNavHeader';
import StatusChip from '@/components/StatusChip';

export default function PatientForecastPage() {
  const params = useParams();
  const patientId = params?.id as string;
  const patient = PATIENTS.find(p => p.id === patientId) || PATIENTS[0];

  const isHighRisk = patient.riskLevel === 'HIGH RISK';

  return (
    <div className="space-y-6">
      {/* Patient Vital Navigation Header & Tabs */}
      <PatientNavHeader patient={patient} />

      {/* Clinical Safety Banner per PRD Section 11 & 13 */}
      <div className="border border-[#12612F] bg-[#04130A] p-3 text-xs flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 bg-[#FFE14A] inline-block" />
          <span className="text-[#FFE14A] font-semibold uppercase tracking-wider">
            INVESTIGATIONAL CLINICAL DECISION SUPPORT
          </span>
          <span className="text-[#12612F]">|</span>
          <span className="text-[#2FBF63]">
            BreathTwin estimates flare-up risk probability with conformal uncertainty; does not issue diagnosis or autonomous prescriptions.
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#B6FFCC] uppercase hidden md:inline">
          CALIBRATED WITH CONFORMAL PREDICTION
        </span>
      </div>

      {/* 24h & 48h Forecast Cards Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 24-Hour Horizon */}
        <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#12612F]/40 pb-2">
            <div>
              <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]">{`// 24-HOUR FORECAST HORIZON`}</span>
              <div className="text-xs text-[#B6FFCC] font-mono">TARGET: ADVERSE EVENT WITHIN 24H</div>
            </div>
            <StatusChip status={patient.risk24h >= 70 ? 'HIGH RISK' : patient.risk24h >= 50 ? 'ELEVATED' : 'NORMAL'} size="sm" />
          </div>

          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[10px] text-[#2FBF63] uppercase tracking-wider">EXACERBATION PROBABILITY</div>
              <div className={`text-4xl font-bold font-mono tabular-nums ${
                patient.risk24h >= 70 ? 'text-[#FF2A1A] glow-danger' : 
                patient.risk24h >= 50 ? 'text-[#FFA61F]' : 'text-[#4CFF8A]'
              }`}>
                {patient.risk24h}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-[#2FBF63] uppercase tracking-wider">CONFORMAL 90% CI</div>
              <div className="text-sm font-mono text-[#B6FFCC]">
                [{patient.risk24hInterval[0]}% &mdash; {patient.risk24hInterval[1]}%]
              </div>
              <div className="text-[10px] text-[#2FBF63]">Calibrated uncertainty</div>
            </div>
          </div>

          <div className="border-t border-[#12612F]/30 pt-2 text-[11px] text-[#2FBF63]">
            {patient.risk24h >= 70 
              ? 'Acute inflammation acceleration underway. Early airway resistance elevated.'
              : 'Sub-acute physiological drift. Airway caliber currently maintained.'}
          </div>
        </div>

        {/* 48-Hour Horizon */}
        <div className={`border bg-[#04130A] p-5 space-y-4 ${
          isHighRisk ? 'border-[#FF2A1A]' : 'border-[#12612F]'
        }`}>
          <div className="flex items-center justify-between border-b border-[#12612F]/40 pb-2">
            <div>
              <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]">{`// 48-HOUR PRIMARY CLINICAL HORIZON`}</span>
              <div className="text-xs text-[#B6FFCC] font-mono">TARGET: 48H ADVERSE EVENT PREDICTION</div>
            </div>
            <StatusChip status={patient.riskLevel} size="sm" />
          </div>

          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[10px] text-[#2FBF63] uppercase tracking-wider">48H PREDICTED RISK</div>
              <div className={`text-4xl font-bold font-mono tabular-nums ${
                isHighRisk ? 'text-[#FF2A1A] glow-danger' : 'text-[#B6FFCC]'
              }`}>
                {patient.risk48h}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-[#2FBF63] uppercase tracking-wider">CONFORMAL 90% CI</div>
              <div className="text-sm font-mono text-[#B6FFCC]">
                [{patient.risk48hInterval[0]}% &mdash; {patient.risk48hInterval[1]}%]
              </div>
              <div className="text-[10px] text-[#2FBF63]">Alert Threshold: &gt; 70%</div>
            </div>
          </div>

          <div className="border-t border-[#12612F]/30 pt-2 flex items-center justify-between text-[11px]">
            <span className="text-[#FFE14A]">LEAD TIME AVAILABLE:</span>
            <span className="font-mono text-[#B6FFCC] font-bold">{patient.leadTimeHours} HOURS</span>
          </div>
        </div>
      </div>

      {/* Environmental Air-Quality Context & Forecast */}
      <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#12612F]/40 pb-2">
          <div>
            <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]">{`// AMBIENT POLLUTION CONTEXT &bull; {patient.city.toUpperCase()} ({patient.station})`}</span>
            <div className="text-xs text-[#B6FFCC] font-mono">STREAM: OPEN CPCB / OPENAQ INDIA REAL-TIME INGESTION</div>
          </div>
          <span className="text-xs font-mono text-[#FFE14A] border border-[#12612F] px-2 py-0.5 bg-[#020A05]">
            AQI: {patient.currentAirQuality.aqi} &bull; {patient.currentAirQuality.aqiCategory.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="border border-[#12612F] bg-[#061C0E] p-3">
            <div className="text-[10px] text-[#2FBF63] uppercase">FINE PARTICLES (PM2.5)</div>
            <div className="text-xl font-bold font-mono text-[#FF2A1A] mt-1">{patient.currentAirQuality.pm25} µg/m³</div>
            <div className="text-[10px] text-[#2FBF63]">WHO Safe Limit: 15 µg/m³</div>
          </div>

          <div className="border border-[#12612F] bg-[#061C0E] p-3">
            <div className="text-[10px] text-[#2FBF63] uppercase">COARSE PARTICLES (PM10)</div>
            <div className="text-xl font-bold font-mono text-[#FFA61F] mt-1">{patient.currentAirQuality.pm10} µg/m³</div>
            <div className="text-[10px] text-[#2FBF63]">Bronchial upper airway irritant</div>
          </div>

          <div className="border border-[#12612F] bg-[#061C0E] p-3">
            <div className="text-[10px] text-[#2FBF63] uppercase">TEMPERATURE &amp; INVERSION</div>
            <div className="text-xl font-bold font-mono text-[#B6FFCC] mt-1">{patient.currentAirQuality.temp} &deg;C</div>
            <div className="text-[10px] text-[#2FBF63]">Cold nighttime trapping</div>
          </div>

          <div className="border border-[#12612F] bg-[#061C0E] p-3">
            <div className="text-[10px] text-[#2FBF63] uppercase">RELATIVE HUMIDITY</div>
            <div className="text-xl font-bold font-mono text-[#B6FFCC] mt-1">{patient.currentAirQuality.humidity}%</div>
            <div className="text-[10px] text-[#2FBF63]">Aerosol retention index</div>
          </div>
        </div>
      </div>

      {/* SHAP Explainability & Alert Reasons */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#12612F] pb-2">
          <div>
            <h2 className="text-lg font-semibold text-[#B6FFCC] tracking-wide">{`// Explainable AI: Ranked Alert Drivers (SHAP Attribution)`}</h2>
            <div className="text-xs text-[#2FBF63]">
              Section 9 &amp; 11 Compliance: Never show a risk probability without auditable clinical reasons.
            </div>
          </div>
          <span className="text-xs font-mono text-[#4CFF8A]">
            METHOD: INTEGRATED GRADIENTS + LATENT DECOMPOSITION
          </span>
        </div>

        <div className="space-y-3">
          {patient.shapReasons.map((reason) => {
            const isUp = reason.direction === 'up';
            return (
              <div
                key={reason.rank}
                className="border border-[#12612F] bg-[#04130A] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 border border-[#12612F] bg-[#020A05] flex items-center justify-center font-mono font-bold text-[#B6FFCC] shrink-0">
                    {reason.rank}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-sm text-[#B6FFCC]">{reason.feature}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 border border-[#12612F] text-[#4CFF8A] uppercase">
                        {reason.targetStream}
                      </span>
                    </div>
                    <p className="text-xs text-[#2FBF63] mt-1 leading-relaxed max-w-3xl">
                      {reason.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4 shrink-0 border-t md:border-t-0 border-[#12612F]/40 pt-2 md:pt-0">
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-[#2FBF63]">RISK IMPACT</div>
                    <div className={`font-mono text-base font-bold ${
                      isUp ? 'text-[#FF2A1A]' : 'text-[#4CFF8A]'
                    }`}>
                      {isUp ? `+${reason.impactPercent}%` : `-${reason.impactPercent}%`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action to What-If Sandbox */}
      <div className="border border-[#12612F] bg-[#061C0E] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase text-[#B6FFCC]">
            &gt; READY TO EVALUATE CLINICAL COUNTERFACTUALS?
          </div>
          <p className="text-xs text-[#2FBF63] mt-0.5">
            Test whether staying indoors, wearing an N95 respirator, or boosting steroid controller adherence brings 48h risk below alert threshold.
          </p>
        </div>

        <Link
          href={`/patients/${patient.id}/what-if`}
          className="h-11 px-6 text-xs uppercase tracking-wider font-semibold border border-[#4CFF8A] text-[#4CFF8A] hover:bg-[#4CFF8A] hover:text-[#020A05] transition-colors flex items-center justify-center shrink-0"
        >
          OPEN WHAT-IF SANDBOX &gt;
        </Link>
      </div>
    </div>
  );
}
