# Multimodal Edge Sensors Migration to Patient Portal Design Document

## 1. Intent & Purpose
Migrate the `◈ Real-Time Multimodal Edge Sensors (Face Video & Voice Mic)` and frozen `v2` inference feature exclusively to the Patient Portal ([`patient-portal/page.tsx`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/app/patient-portal/page.tsx)). The legacy patient-side microphone and webcam implementation (Sections 5B and 5C) will be completely removed and superseded by the modular Digital Twin sensor implementation ([`FaceFeaturesDashboard`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/components/FaceFeaturesDashboard.tsx) and [`MicFeaturesDashboard`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/components/MicFeaturesDashboard.tsx)), while [`PatientTwinView.tsx`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/components/PatientTwinView.tsx) will be cleaned up so this edge biosensor suite lives exclusively in the Patient Portal.

## 2. Goals, Non-Goals & Anti-Goals
- **Goals:**
  - Create a cohesive, self-contained component [`MultimodalEdgeSensors.tsx`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/components/MultimodalEdgeSensors.tsx) housing the multimodal edge sensor UI (header, `<FaceFeaturesDashboard>`, `<MicFeaturesDashboard>`, inference trigger, and v2 prediction summary panel).
  - Strip all legacy camera/mic code from [`patient-portal/page.tsx`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/app/patient-portal/page.tsx) (Sections 5B & 5C, audio canvas, simulated webcam canvas, audio/video streaming intervals, and associated state/refs).
  - Embed `<MultimodalEdgeSensors />` cleanly in [`patient-portal/page.tsx`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/app/patient-portal/page.tsx).
  - Remove the multimodal edge sensors section, unused state, and unused imports from [`PatientTwinView.tsx`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/components/PatientTwinView.tsx).
- **Non-Goals:**
  - Modifying backend `/api/patients/{id}/predict-v2`, `/api/patients/{id}/face-features`, or `/api/patients/{id}/mic-features` endpoints.
  - Modifying the internal feature extraction mechanics inside [`FaceFeaturesDashboard.tsx`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/components/FaceFeaturesDashboard.tsx) or [`MicFeaturesDashboard.tsx`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/components/MicFeaturesDashboard.tsx).
- **Anti-Goals:**
  - Leaving zombie/orphaned streams, animation frames, or timers running in the background when navigating away or unmounting.
  - Leaving duplicate edge sensor views in both Doctor and Patient views.

## 3. Constraints
- Must pass `npx tsc --noEmit` with 0 type errors.
- Must pass Next.js production build (`npm run build`).
- Dark theme and styling in `MultimodalEdgeSensors.tsx` must align seamlessly with Patient Portal cyber-clinical aesthetics (`#04130A`, `#12612F`, `#4CFF8A`, `#0E793C`).

## 4. Approaches Considered
- **Approach 1 (Selected): Dedicated Modular Wrapper Component (`MultimodalEdgeSensors.tsx`)**
  - Encapsulate `liveFace`, `liveMic`, `v2Prediction`, `isPredictingV2`, `handleRunV2Prediction`, and the prediction display card inside a dedicated component.
  - *Why Selected:* Prevents further bloating of `patient-portal/page.tsx` (already ~2,680 lines), provides clean separation of concerns, and isolates audio/video stream lifecycles.
- **Approach 2: Direct Inline Integration into Patient Portal**
  - Insert all state hooks, callbacks, and JSX directly into `patient-portal/page.tsx`.
  - *Trade-off:* Clutters `patient-portal/page.tsx` and increases risk of regression with page-level state.

## 5. Architectural & Implementation Details
1. **New Component: [`MultimodalEdgeSensors.tsx`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/components/MultimodalEdgeSensors.tsx)**:
   - Props: `{ patientId: string; currentTelemetry?: TelemetryPoint | null }`.
   - Houses state: `liveFace` (`FaceFeatures | null`), `liveMic` (`MicFeatures | null`), `v2Prediction` (`PredictV2Response | null`), `isPredictingV2` (`boolean`).
   - Action: `handleRunV2Prediction` invokes `predictPatientV2(patientId, ...)`.
   - Renders:
     - Header: `◈ Real-Time Multimodal Edge Sensors (Face Video & Voice Mic)` with action button `[⚡ RUN v2 FROZEN INFERENCE]`.
     - Subcomponents: `<FaceFeaturesDashboard patientId={patientId} onFeaturesUpdate={setLiveFace} />` and `<MicFeaturesDashboard patientId={patientId} onFeaturesUpdate={setLiveMic} />`.
     - Output card: `◈ LATEST v2 MULTIMODAL PREDICTIONS (FROZEN FORWARD-PASS)` with 24h risk, 48h risk, severity grade, confidence, and model version.
2. **Patient Portal Cleanup & Integration: [`patient-portal/page.tsx`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/app/patient-portal/page.tsx)**:
   - Remove legacy microphone state, refs, animation loops, and handlers (`audioContextRef`, `analyserRef`, `micStreamRef`, `mediaRecorderRef`, `startMicrophoneMonitoring`, `stopMicrophoneMonitoring`, `handleManualSyncAcoustic`, `simulateDetectedCough`, etc.).
   - Remove legacy webcam state, refs, canvas loops, and handlers (`videoElementRef`, `videoCanvasRef`, `simulatedCanvasRef`, `cameraStreamRef`, `videoIntervalRef`, `simAnimationRef`, `startCameraMonitoring`, `startSimulatedCameraMonitoring`, `stopCameraMonitoring`, etc.).
   - In place of JSX sections 5B & 5C, render `<MultimodalEdgeSensors patientId={activePatientId} currentTelemetry={patient?.currentTelemetry} />`.
3. **Digital Twin Cleanup: [`PatientTwinView.tsx`](file:///home/casp1an/Code/DigiTwin/ABAY_LNMIIT/NSUT/frontend/components/PatientTwinView.tsx)**:
   - Delete lines 240-350 (`{/* REAL-TIME FACE & MIC MULTIMODAL STREAMING + v2 PREDICTIONS */}`).
   - Delete unused states (`liveFace`, `liveMic`, `v2Prediction`, `isPredictingV2`) and `handleRunV2Prediction`.
   - Remove unused imports (`FaceFeaturesDashboard`, `MicFeaturesDashboard`, `predictPatientV2`, `FaceFeatures`, `MicFeatures`, `PredictV2Response`).

## 6. Verification Plan
- `cd ABAY_LNMIIT/NSUT/frontend && npx tsc --noEmit`: 0 TypeScript compiler errors.
- `cd ABAY_LNMIIT/NSUT/frontend && npm run build`: Successful build output.
- Verification checklist confirming removal of legacy code and exclusive placement in Patient Portal.
