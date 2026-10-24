# Multimodal Edge Sensors Patient Portal Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Real-Time Multimodal Edge Sensors (Face Video & Voice Mic) and v2 frozen inference suite exclusively into the Patient Portal, replacing all legacy patient-side camera/mic components and removing them from the clinician digital twin view.

**Architecture:** Encapsulate the edge biosensors (`FaceFeaturesDashboard`, `MicFeaturesDashboard`), frozen v2 forward-pass trigger (`predictPatientV2`), and prediction scorecard inside a dedicated reusable component [`MultimodalEdgeSensors.tsx`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/components/MultimodalEdgeSensors.tsx). Integrate this component into [`patient-portal/page.tsx`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/app/patient-portal/page.tsx) while removing ~700 lines of legacy chunk streaming and canvas code, and remove the feature completely from [`PatientTwinView.tsx`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/components/PatientTwinView.tsx).

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript 5, Tailwind CSS 4.

**Spec:** [`docs/superpowers/specs/2026-10-24-multimodal-edge-sensors-patient-portal-design.md`](file:///home/casp1an/Code/DigiTwin/docs/superpowers/specs/2026-10-24-multimodal-edge-sensors-patient-portal-design.md)

## Global Constraints
- `npx tsc --noEmit` must pass with 0 errors after every task.
- `npm run build` must produce a valid production build.
- No zombie/orphaned media streams, animation frame handles, or intervals may remain active when components unmount.
- Visual styling must conform to the cyber-clinical palette: `#04130A` (card background), `#020A05` (dark surface), `#12612F` (borders), `#4CFF8A` (primary green accents), `#B6FFCC` (headings).

## Review Focus
1. **Unmount cleanup**: Video and audio tracks must release hardware resources immediately when switching tabs or navigating away.
2. **Missing telemetry fallback**: If `currentTelemetry` is null or partially undefined, `predictPatientV2` must still execute cleanly with fallback heuristic or available channels.
3. **Role & Patient isolation**: When previewing different patients in the patient portal (e.g. Doctor role previewing PT-8821 or PT-4409), `MultimodalEdgeSensors` must react to `patientId` updates.
4. **Zero legacy stream leaks**: No lingering calls to `streamAudioChunk` or `streamVideoChunk` remain in `patient-portal/page.tsx`.
5. **No twin view regressions**: Removing the sensor block from `PatientTwinView.tsx` must not break the 7-day replay slider, pulmonary 3D twin, or what-if links.

---

### Task 1: Create `MultimodalEdgeSensors` Component

**Files:**
- Create: `ABAY_LNMIIT/NSUT/frontend/components/MultimodalEdgeSensors.tsx`

**Interfaces:**
- Consumes:
  - `FaceFeaturesDashboard` from `@/components/FaceFeaturesDashboard`
  - `MicFeaturesDashboard` from `@/components/MicFeaturesDashboard`
  - `predictPatientV2`, `FaceFeatures`, `MicFeatures`, `PredictV2Response` from `@/lib/api`
  - `TelemetryPoint` from `@/lib/data`
- Produces:
  - Default export `MultimodalEdgeSensors`: `React.FC<{ patientId: string; currentTelemetry?: TelemetryPoint | { rhr?: number; rr?: number; spo2?: number; hrv?: number; pm25?: number; rescuePuffs24h?: number } | null }>`

- [ ] **Step 1: Create the component file**
Create `ABAY_LNMIIT/NSUT/frontend/components/MultimodalEdgeSensors.tsx` with:
- Props interface:
  ```typescript
  interface MultimodalEdgeSensorsProps {
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
  ```
- Internal state:
  - `liveFace`: `FaceFeatures | null`
  - `liveMic`: `MicFeatures | null`
  - `v2Prediction`: `PredictV2Response | null`
  - `isPredictingV2`: `boolean`
- Handler `handleRunV2Prediction`:
  - Builds `wearable_telemetry` from `currentTelemetry` if present:
    ```typescript
    wearable_telemetry: currentTelemetry ? {
      heart_rate: currentTelemetry.rhr,
      respiratory_rate: currentTelemetry.rr,
      spo2: currentTelemetry.spo2,
      hrv: currentTelemetry.hrv,
      pm25: currentTelemetry.pm25,
    } : undefined
    ```
  - Calls `predictPatientV2(patientId, { face_features: liveFace || undefined, mic_features: liveMic || undefined, wearable_telemetry })`.
  - Sets `v2Prediction` on success; catches errors cleanly with `console.error`.
- JSX rendering:
  - Header: `◈ Real-Time Multimodal Edge Sensors (Face Video & Voice Mic)` and subtitle.
  - Button: `[⚡ RUN v2 FROZEN INFERENCE]` (disabled when `isPredictingV2`).
  - Child components: `<FaceFeaturesDashboard patientId={patientId} onFeaturesUpdate={setLiveFace} />` and `<MicFeaturesDashboard patientId={patientId} onFeaturesUpdate={setLiveMic} />`.
  - Predictions scorecard: `◈ LATEST v2 MULTIMODAL PREDICTIONS (FROZEN FORWARD-PASS)` with 24H Exacerbation Risk, 48H Horizon Risk, Severity Tier, and Confidence.

- [ ] **Step 2: Verify TypeScript compilation**
Run: `cd ABAY_LNMIIT/NSUT/frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit component**
```bash
git add ABAY_LNMIIT/NSUT/frontend/components/MultimodalEdgeSensors.tsx
git commit -m "feat(sensors): create MultimodalEdgeSensors wrapper component"
```

---

### Task 2: Clean Up `PatientTwinView.tsx` (Remove Sensors from Doctor Twin)

**Files:**
- Modify: `ABAY_LNMIIT/NSUT/frontend/components/PatientTwinView.tsx:10-14,28-56,240-352`

**Interfaces:**
- Consumes: Nothing removed that other components consume.
- Produces: `PatientTwinView` without multimodal edge sensor block.

- [ ] **Step 1: Remove unused imports from `PatientTwinView.tsx`**
Remove:
```typescript
import FaceFeaturesDashboard from '@/components/FaceFeaturesDashboard';
import MicFeaturesDashboard from '@/components/MicFeaturesDashboard';
import { FaceFeatures, MicFeatures, PredictV2Response, predictPatientV2 } from '@/lib/api';
```

- [ ] **Step 2: Remove multimodal v2 state and handler from `PatientTwinView.tsx`**
Remove:
```typescript
// Real-Time Multimodal v2 State
const [liveFace, setLiveFace] = useState<FaceFeatures | null>(null);
const [liveMic, setLiveMic] = useState<MicFeatures | null>(null);
const [v2Prediction, setV2Prediction] = useState<PredictV2Response | null>(null);
const [isPredictingV2, setIsPredictingV2] = useState<boolean>(false);

const handleRunV2Prediction = async () => { ... };
```

- [ ] **Step 3: Remove the JSX section from `PatientTwinView.tsx`**
Remove lines 240-350:
`{/* REAL-TIME FACE & MIC MULTIMODAL STREAMING + v2 PREDICTIONS */}` and the entire enclosing `<div className="space-y-6 pt-2">...</div>`.

- [ ] **Step 4: Verify TypeScript compilation**
Run: `cd ABAY_LNMIIT/NSUT/frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit `PatientTwinView` cleanup**
```bash
git add ABAY_LNMIIT/NSUT/frontend/components/PatientTwinView.tsx
git commit -m "refactor(twin): remove edge sensor section so it lives exclusively on patient side"
```

---

### Task 3: Override and Remove Legacy Sensors & Integrate `MultimodalEdgeSensors` in `patient-portal/page.tsx`

**Files:**
- Modify: `ABAY_LNMIIT/NSUT/frontend/app/patient-portal/page.tsx`

**Interfaces:**
- Consumes: `MultimodalEdgeSensors` from `@/components/MultimodalEdgeSensors`
- Produces: Patient Portal page with unified modern edge biosensor suite.

- [ ] **Step 1: Update imports in `patient-portal/page.tsx`**
Remove unused legacy imports from `@/lib/api`:
- `streamAudioChunk`
- `AudioStreamChunkResponse`
- `AcousticTelemetryRecord`
- `streamVideoChunk`
- `VideoStreamChunkResponse`
- `VisualTelemetryRecord`
Import:
- `import MultimodalEdgeSensors from '@/components/MultimodalEdgeSensors';`

- [ ] **Step 2: Remove legacy microphone state, refs, and handlers**
Remove:
- States: `isMicActive`, `micPermission`, `audioLevel`, `detectedCoughs`, `detectedCoughSeverity`, `detectedWheeze`, `liveAsthmaChances`, `liveRiskLevel`, `acousticSyncMessage`, `isSyncingAcoustic`.
- Refs: `audioContextRef`, `analyserRef`, `micStreamRef`, `animationFrameRef`, `canvasRef`, `mediaRecorderRef`.
- Functions: `startMicrophoneMonitoring`, `stopMicrophoneMonitoring`, `handleManualSyncAcoustic`, `simulateDetectedCough`.

- [ ] **Step 3: Remove legacy webcam state, refs, and handlers**
Remove:
- States: `isCameraActive`, `isSimulatedCamera`, `cameraPermission`, `cameraErrorMessage`, `cameraErrorType`, `mouthBreathingDetected`, `nasalFlaringDetected`, `accessoryStrainDetected`, `facialDistressGrade`, `videoRespiratoryRate`, `opticalHeartRate`, `mouthAspectPct`, `videoSyncMessage`, `isSyncingVideo`.
- Refs: `videoElementRef`, `videoCanvasRef`, `simulatedCanvasRef`, `cameraStreamRef`, `videoIntervalRef`, `simAnimationRef`, `mouthAspectRef`, `nasalFlaringRef`, `accessoryStrainRef`, `opticalHrRef`, `respRateRef`.
- Functions: `stopCameraMonitoring`, `startSimulatedCameraMonitoring`, `startCameraMonitoring`, `stopCameraMonitoringOriginal`, `handleManualSyncVideo`.
- Cleanup effect:
  ```typescript
  useEffect(() => {
    return () => {
      stopMicrophoneMonitoring();
      stopCameraMonitoring();
    };
  }, []);
  ```

- [ ] **Step 4: Replace JSX Sections 5B and 5C with `MultimodalEdgeSensors`**
Replace lines 1818-2294 (Section 5B `SMART ACOUSTIC COUGH & RESPIRATORY SENSOR` and Section 5C `SMART WEBCAM FACIAL RESPIRATORY DISTRESS BIOSENSOR`) with:
```tsx
{/* =========================================================================
    5B. REAL-TIME MULTIMODAL EDGE SENSORS (FACE VIDEO & VOICE MIC)
========================================================================= */}
<section aria-labelledby="edge-sensors-heading" className="space-y-4">
  <MultimodalEdgeSensors
    patientId={patient.id}
    currentTelemetry={patient.currentTelemetry}
  />
</section>
```

- [ ] **Step 5: Verify TypeScript compilation**
Run: `cd ABAY_LNMIIT/NSUT/frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit Patient Portal integration**
```bash
git add ABAY_LNMIIT/NSUT/frontend/app/patient-portal/page.tsx
git commit -m "feat(portal): replace legacy mic/camera with MultimodalEdgeSensors"
```

---

### Task 4: Comprehensive Verification

**Files:**
- Verify: Entire frontend application

- [ ] **Step 1: Run TypeScript Type Check**
Run: `cd ABAY_LNMIIT/NSUT/frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Run Production Build**
Run: `cd ABAY_LNMIIT/NSUT/frontend && npm run build`
Expected: Build passes with exit code 0.

- [ ] **Step 3: Verification Audit of Requirements**
- Verify `PatientTwinView.tsx` contains NO references to `FaceFeaturesDashboard` or `MicFeaturesDashboard`.
- Verify `patient-portal/page.tsx` contains NO references to `streamAudioChunk`, `streamVideoChunk`, `startCameraMonitoring`, or `startMicrophoneMonitoring`.
- Verify `MultimodalEdgeSensors.tsx` renders in `patient-portal/page.tsx`.
