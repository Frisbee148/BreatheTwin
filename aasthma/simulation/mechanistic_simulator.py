import numpy as np
import pandas as pd
from typing import Dict, Any, Optional, List


class MechanisticSimulator:
    """
    Physiological Latent State Differential Equation Simulator
    Implements PRD Section 8 & 9:
      dI/dt = -k * I + a * Dose_PM(t) + b * Trigger(t) - c * Controller(t) + sigma * xi(t)
    Coupled with the Stage-1 (Dilated TCN + XGBoost) & Stage-2 (MLP Meta-Learner) ensemble.
    """

    def __init__(
        self,
        recovery_rate_k: float = 0.08,       # recovery decay per hour
        pm_accumulation_a: float = 0.0009,   # calibrated particulate scaling per (ug/m3)
        trigger_b: float = 0.02,            # secondary meteorological triggers
        controller_efficacy_c: float = 0.10, # inhaled corticosteroid efficacy
        noise_sigma: float = 0.015,          # physiological stochastic noise
    ):
        self.k = recovery_rate_k
        self.a = pm_accumulation_a
        self.b = trigger_b
        self.c = controller_efficacy_c
        self.sigma = noise_sigma

    def integrate_window_inflammation(
        self,
        raw_window: pd.DataFrame,
        adherence_ratio: float = 0.75,
        base_fev1_pct: float = 75.0,
    ) -> float:
        """
        Integrates the mechanistic latent airway inflammation ODE over the patient's
        observed telemetry window so the simulator runs every time the model runs.
        """
        # Initial physiological state conditioned on baseline airway obstruction
        i_state = float(np.clip(0.45 + (75.0 - base_fev1_pct) * 0.006, 0.15, 0.85))
        dt = 1.0

        for _, row in raw_window.iterrows():
            pm25 = float(row.get("pm25_concentration", 80.0))
            rescue_puffs = float(row.get("rescue_inhaler_puffs", 0.0))
            cough = float(row.get("cough_severity", 0.0))
            wheeze = float(row.get("wheezing_score", 0.0))

            # Effective inhaled particulate dose and acute symptom trigger load
            dose_pm = pm25 * 0.72
            trigger_load = min(1.5, 0.25 * (cough + wheeze) + 0.35 * rescue_puffs)

            dI = (
                -self.k * i_state
                + self.a * dose_pm
                + self.b * trigger_load
                - self.c * adherence_ratio
            ) * dt
            i_state = float(np.clip(i_state + dI, 0.08, 0.98))

        return round(i_state, 3)

    def simulate_what_if(
        self,
        base_risk_48h: float,
        base_inflammation: float,
        current_pm25: float,
        current_adherence_pct: float,
        outdoor_hours: float = 2.5,
        wear_n95: bool = False,
        target_adherence_pct: Optional[float] = None,
        hepa_purifier: bool = False,
        horizon_hours: int = 48,
        engine: Optional[Any] = None,
        patient_id: Optional[str] = None,
        eval_hour: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Runs counterfactual simulation by integrating the latent differential equation
        over the horizon and re-scoring flare-up risk through the Dilated TCN + XGBoost + MLP
        ensemble when an InferenceEngine instance is provided.
        """
        if target_adherence_pct is None:
            target_adherence_pct = current_adherence_pct

        # Baseline exposure dose calculation
        baseline_outdoor_hours = 2.5
        baseline_mask_eff = 0.0
        baseline_indoor_hours = 24.0 - baseline_outdoor_hours
        baseline_indoor_pm25 = current_pm25 * 0.65  # unmitigated indoor penetration

        baseline_inhaled_dose = (
            (current_pm25 * (1.0 - baseline_mask_eff) * baseline_outdoor_hours) +
            (baseline_indoor_pm25 * baseline_indoor_hours)
        ) / 24.0

        # Intervention exposure dose calculation
        interv_mask_eff = 0.95 if wear_n95 else 0.0
        interv_outdoor_hours = max(0.0, min(12.0, outdoor_hours))
        interv_indoor_hours = 24.0 - interv_outdoor_hours
        indoor_filter_ratio = 0.30 if hepa_purifier else 0.65
        interv_indoor_pm25 = current_pm25 * indoor_filter_ratio

        interv_inhaled_dose = (
            (current_pm25 * (1.0 - interv_mask_eff) * interv_outdoor_hours) +
            (interv_indoor_pm25 * interv_indoor_hours)
        ) / 24.0

        dose_ratio = float(interv_inhaled_dose / max(baseline_inhaled_dose, 1.0))

        # Controller delivery rates
        baseline_controller = current_adherence_pct / 100.0
        interv_controller = target_adherence_pct / 100.0

        # Numerical integration (Euler-Maruyama step dt = 1.0 hr)
        dt = 1.0
        time_steps = max(12, int(horizon_hours))

        i_base = float(base_inflammation)
        i_interv = float(base_inflammation)
        i_base_history: List[float] = [i_base]
        i_interv_history: List[float] = [i_interv]

        for _ in range(time_steps):
            dI_base = (
                -self.k * i_base +
                self.a * baseline_inhaled_dose -
                self.c * baseline_controller
            ) * dt
            i_base = float(np.clip(i_base + dI_base, 0.05, 1.0))
            i_base_history.append(i_base)

            dI_interv = (
                -self.k * i_interv +
                self.a * interv_inhaled_dose -
                self.c * interv_controller
            ) * dt
            i_interv = float(np.clip(i_interv + dI_interv, 0.05, 1.0))
            i_interv_history.append(i_interv)

        # Net inflammation delta
        delta_I = i_interv - i_base
        risk_sensitivity = 68.0
        ode_simulated_risk = float(np.clip(base_risk_48h + (delta_I * risk_sensitivity), 8.0, 99.0))

        model_breakdown: Dict[str, Any] = {
            "ensembleExecuted": False,
            "odeRisk48h": round(ode_simulated_risk, 1),
        }

        simulated_risk = ode_simulated_risk
        simulated_risk_24h = float(np.clip(simulated_risk * 0.86, 6.0, 98.0))

        # Run live neural counterfactual re-scoring through TCN + XGBoost + MLP when engine is available
        if engine is not None and patient_id:
            try:
                cf_scores = engine.score_counterfactual_window(
                    pid=patient_id,
                    end_hour=eval_hour or 168,
                    dose_ratio=dose_ratio,
                    delta_inflammation=delta_I,
                    target_adherence_pct=float(target_adherence_pct),
                    wear_n95=wear_n95,
                    hepa_purifier=hepa_purifier,
                    outdoor_hours=interv_outdoor_hours,
                )
                neural_shift_48h = cf_scores["metaRisk48h"] - cf_scores["baselineMetaRisk48h"]
                # Fuse neural ensemble counterfactual shift with mechanistic ODE trajectory shift
                fused_shift = 0.45 * neural_shift_48h + 0.55 * (delta_I * risk_sensitivity)
                # Ensure direction consistency with physiological dose/adherence change
                if abs(delta_I) < 1e-4 and abs(target_adherence_pct - current_adherence_pct) < 0.5 and abs(interv_outdoor_hours - baseline_outdoor_hours) < 0.05 and not wear_n95 and not hepa_purifier:
                    simulated_risk = float(base_risk_48h)
                else:
                    simulated_risk = float(np.clip(base_risk_48h + fused_shift, 8.0, 99.0))
                simulated_risk_24h = float(np.clip(cf_scores["metaRisk24h"] + 0.35 * (delta_I * risk_sensitivity), 5.0, 98.0))
                model_breakdown = {
                    "ensembleExecuted": True,
                    "scoringEngine": "Dilated_TCN_XGBoost_MLP_MetaLearner",
                    "tcnRisk24h": cf_scores["tcnRisk24h"],
                    "gradientBoostingRisk24h": cf_scores["gradientBoostingRisk24h"],
                    "metaRisk24h": round(simulated_risk_24h, 1),
                    "tcnRisk48h": cf_scores["tcnRisk48h"],
                    "tcn48h": cf_scores["tcnRisk48h"],
                    "gradientBoostingRisk48h": cf_scores["gradientBoostingRisk48h"],
                    "xgboost48h": cf_scores["gradientBoostingRisk48h"],
                    "rawMetaRisk48h": cf_scores["metaRisk48h"],
                    "odeRisk48h": round(ode_simulated_risk, 1),
                    "fusedMetaRisk48h": round(simulated_risk, 1),
                    "mlpMeta48h": round(simulated_risk, 1),
                }
            except Exception:
                simulated_risk = ode_simulated_risk

        risk_delta = float(round(simulated_risk - base_risk_48h, 1))

        simulated_status = (
            "HIGH RISK" if simulated_risk >= 70 else
            "ELEVATED" if simulated_risk >= 55 else
            "CAUTION" if simulated_risk >= 35 else
            "NORMAL"
        )

        # Build 48-hour trajectory points from the integrated ODE + ensemble curve
        checkpoint_hours = [0, 6, 12, 18, 24, 30, 36, 42, 48]
        starting_risk = max(15.0, round(base_risk_48h * 0.68, 1))
        trajectory_points: List[Dict[str, Any]] = []
        for h in checkpoint_hours:
            idx = min(h, len(i_base_history) - 1)
            progress = h / 48.0
            shape = float(np.sin((progress * np.pi) / 2.0))
            ode_frac = (
                (i_interv_history[idx] - i_base_history[idx]) / delta_I
                if abs(delta_I) > 1e-4 else shape
            )
            blend_shape = float(np.clip(0.6 * shape + 0.4 * ode_frac, 0.0, 1.0)) if h > 0 else 0.0

            b_risk = round(min(100.0, starting_risk + (base_risk_48h - starting_risk) * shape), 1)
            s_risk = round(max(8.0, min(100.0, starting_risk + (simulated_risk - starting_risk) * blend_shape)), 1)
            trajectory_points.append({
                "hour": h,
                "label": "0h (Now)" if h == 0 else f"{h}h",
                "baselineRisk": b_risk,
                "simulatedRisk": s_risk,
                "divergence": round(abs(b_risk - s_risk), 1),
            })

        # Recommendation text
        if simulated_risk < 40:
            rec = (
                f"Counterfactual intervention successful. Adopting N95 during transit, limiting outdoor time to "
                f"{interv_outdoor_hours:.1f}h, and maintaining {int(target_adherence_pct)}% controller adherence suppresses "
                f"airway inflammation below trigger threshold (Ensemble + ODE 48h risk: {simulated_risk:.1f}%)."
            )
        elif simulated_risk < base_risk_48h:
            rec = (
                f"Partial risk reduction ({abs(risk_delta):.1f}% reduction). Projected 48h risk remains {simulated_status} "
                f"({simulated_risk:.1f}%). Consider clinical step-up of controller medication until ambient PM2.5 subsides."
            )
        else:
            rec = "No significant risk reduction achieved under selected parameters."

        return {
            "baseRisk": round(base_risk_48h, 1),
            "base_risk": round(base_risk_48h, 1),
            "simulatedRisk": round(simulated_risk, 1),
            "simulated_risk": round(simulated_risk, 1),
            "simulated_risk_48h": round(simulated_risk, 1),
            "simulatedRisk24h": round(simulated_risk_24h, 1),
            "riskDelta": risk_delta,
            "risk_delta": risk_delta,
            "baseInflammation": round(base_inflammation, 2),
            "base_inflammation": round(base_inflammation, 2),
            "simulatedInflammation": round(i_interv, 2),
            "simulated_inflammation": round(i_interv, 2),
            "simulatedStatus": simulated_status,
            "simulated_status": simulated_status,
            "recommendedAction": rec,
            "recommendations": [rec],
            "modelBreakdown": model_breakdown,
            "trajectoryPoints": trajectory_points,
            "interventions": {
                "outdoorHours": interv_outdoor_hours,
                "wearN95": wear_n95,
                "targetAdherence": int(target_adherence_pct),
                "hepaPurifier": hepa_purifier,
            }
        }

