from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np


class SimulationClock:
    """
    Simulation Clock for Replaying Multimodal Patient Streams (PRD FR-4).
    Controls the temporal progress through the 10-day (240-hour) cohort simulation.
    """

    def __init__(
        self,
        initial_hour: int = 168,  # Default to Day 7 complete (Hour 168)
        min_hour: int = 12,
        max_hour: int = 239,
        base_timestamp: str = "2026-10-07T00:00:00+05:30",
    ):
        self.min_hour = min_hour
        self.max_hour = max_hour
        self.current_hour = max(self.min_hour, min(initial_hour, self.max_hour))
        self.base_time = datetime.fromisoformat(base_timestamp)
        self.is_playing = False
        self.speed = 1.0  # multiplier

    def set_hour(self, hour: int) -> int:
        """Set clock to a specific simulation hour [min_hour, max_hour]."""
        self.current_hour = max(self.min_hour, min(int(hour), self.max_hour))
        return self.current_hour

    def step(self, hours: int = 1) -> int:
        """Advance or rewind clock by N hours."""
        return self.set_hour(self.current_hour + hours)

    def reset(self) -> int:
        """Reset clock to default Day 7 (Hour 168)."""
        self.current_hour = 168
        self.is_playing = False
        return self.current_hour

    def get_time_info(self) -> Dict[str, Any]:
        """Return the current clock status, simulated date, and day markers."""
        sim_time = self.base_time + timedelta(hours=self.current_hour)
        day_num = (self.current_hour // 24) + 1
        hour_of_day = self.current_hour % 24
        
        day_label = f"Day {day_num}"
        if day_num == 7:
            day_label += " (Now)"

        return {
            "current_hour": self.current_hour,
            "day_number": day_num,
            "hour_of_day": hour_of_day,
            "day_label": day_label,
            "simulated_time_iso": sim_time.isoformat(),
            "formatted_time": sim_time.strftime("%Y-%m-%d %H:%M IST"),
            "min_hour": self.min_hour,
            "max_hour": self.max_hour,
            "is_playing": self.is_playing,
            "speed": self.speed,
        }

    def filter_telemetry(self, df: pd.DataFrame) -> pd.DataFrame:
        """Filter time-series data up to the current simulation hour."""
        if "timestamp_hour" in df.columns:
            return df[df["timestamp_hour"] <= self.current_hour].copy()
        return df

    def aggregate_daily_telemetry(
        self,
        df: pd.DataFrame,
        inflammation_threshold: float = 0.65
    ) -> List[Dict[str, Any]]:
        """
        Aggregates raw hourly telemetry into daily points (Days 1 to current day)
        matching the frontend TelemetryPoint schema.
        """
        filtered = self.filter_telemetry(df)
        if filtered.empty:
            return []

        # Group by day
        filtered["day_num"] = (filtered["timestamp_hour"] // 24) + 1
        daily_points = []

        for d, group in filtered.groupby("day_num"):
            day_int = int(d)
            day_date = (self.base_time + timedelta(days=day_int - 1)).strftime("%b %d")
            
            spo2_mean = float(group["spo2"].mean()) if "spo2" in group else 96.0
            rr_mean = float(group["respiratory_rate"].mean()) if "respiratory_rate" in group else 15.0
            rhr_mean = float(group["heart_rate"].mean()) if "heart_rate" in group else 70.0
            hrv_mean = float(group["hrv_rmssd"].mean()) if "hrv_rmssd" in group else 35.0
            awakenings_sum = int(group["sleep_interruptions"].sum()) if "sleep_interruptions" in group else 1
            rescue_sum = int(group["rescue_inhaler_puffs"].sum()) if "rescue_inhaler_puffs" in group else 0
            pm25_mean = float(group["pm25_concentration"].mean()) if "pm25_concentration" in group else 80.0

            # Normalized surrogate latent inflammation state based on PM2.5, RR drift, rescue puffs
            # Centered around baseline
            norm_pm25 = max(0.0, (pm25_mean - 40.0) / 160.0)
            norm_rr = max(0.0, (rr_mean - 14.0) / 8.0)
            norm_puffs = min(1.0, rescue_sum / 6.0)
            inf_state = round(0.35 + 0.3 * norm_pm25 + 0.25 * norm_rr + 0.1 * norm_puffs, 2)
            inf_state = min(0.98, max(0.15, inf_state))

            is_latest_day = (day_int == (self.current_hour // 24) + 1)
            day_str = f"Day {day_int}{' (Now)' if is_latest_day else ''}"

            daily_points.append({
                "day": day_str,
                "dayShort": f"D{day_int}",
                "date": day_date,
                "spo2": round(spo2_mean, 1),
                "rr": round(rr_mean, 1),
                "rhr": round(rhr_mean, 0),
                "hrv": round(hrv_mean, 0),
                "sleepAwakenings": awakenings_sum,
                "rescuePuffs": rescue_sum,
                "pm25": round(pm25_mean, 0),
                "inflammationState": inf_state,
                "threshold": inflammation_threshold,
            })

        return daily_points


# Singleton instance for server-wide synchronization
global_clock = SimulationClock()
