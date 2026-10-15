import os
import sys
import time
import pandas as pd
from sqlalchemy import text
from aasthma.database.connection import engine, Base, DATABASE_URL
from aasthma.database.models import PatientModel, PatientHistoryModel, ClinicalEventModel, TelemetryModel, PatientDailyLogModel

# Base dataset paths
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
AASTHMA_DIR = os.path.dirname(CURRENT_DIR)
DATA_DIR = os.path.join(AASTHMA_DIR, "dataset", "data")

PATIENTS_PATH = os.path.join(DATA_DIR, "static", "patients.csv")
HISTORY_PATH = os.path.join(DATA_DIR, "static", "history_features.csv")
TIMESERIES_PATH = os.path.join(DATA_DIR, "dynamic", "timeseries.tsv")
EVENTS_PATH = os.path.join(DATA_DIR, "labels", "events.csv")


def run_migration():
    print("=" * 60)
    print(" BreathTwin PostgreSQL Migration")
    print(f" Target Database: {DATABASE_URL}")
    print("=" * 60)

    start_time = time.time()

    # Step 1: Create all tables & indexes
    print("\n[1/5] Creating database tables and indexes...")
    Base.metadata.create_all(bind=engine)
    print("✓ Tables created successfully (patients, patient_history, clinical_events, timeseries_telemetry, patient_daily_logs).")

    # Step 2: Migrate Static Patients
    print("\n[2/5] Migrating static patient records...")
    df_patients = pd.read_csv(PATIENTS_PATH)
    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM patients")).scalar()
        if count == 0:
            df_patients.to_sql("patients", con=engine, if_exists="append", index=False)
            print(f"✓ Inserted {len(df_patients)} patients into 'patients' table.")
        else:
            print(f"✓ Table 'patients' already contains {count} rows. Skipping insert.")

    # Step 3: Migrate Patient History
    print("\n[3/5] Migrating patient clinical history...")
    df_history = pd.read_csv(HISTORY_PATH)
    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM patient_history")).scalar()
        if count == 0:
            df_history.to_sql("patient_history", con=engine, if_exists="append", index=False)
            print(f"✓ Inserted {len(df_history)} history records into 'patient_history' table.")
        else:
            print(f"✓ Table 'patient_history' already contains {count} rows. Skipping insert.")

    # Step 4: Migrate Clinical Events
    print("\n[4/5] Migrating clinical exacerbation events...")
    df_events = pd.read_csv(EVENTS_PATH)
    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM clinical_events")).scalar()
        if count == 0:
            df_events.to_sql("clinical_events", con=engine, if_exists="append", index=False)
            print(f"✓ Inserted {len(df_events)} events into 'clinical_events' table.")
        else:
            print(f"✓ Table 'clinical_events' already contains {count} rows. Skipping insert.")

    # Step 5: Migrate Time-Series Telemetry
    print("\n[5/5] Migrating continuous hourly telemetry timeseries (240k rows)...")
    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM timeseries_telemetry")).scalar()
        if count == 0:
            print("Reading timeseries.tsv...")
            t0 = time.time()
            df_ts = pd.read_csv(TIMESERIES_PATH, sep="\t")
            print(f"Read {len(df_ts)} rows in {time.time() - t0:.2f}s. Streaming into PostgreSQL...")
            
            t1 = time.time()
            # Insert in chunks of 20,000 using raw psycopg copy for maximum throughput
            raw_conn = engine.raw_connection()
            try:
                with raw_conn.cursor() as cur:
                    cols = list(df_ts.columns)
                    col_str = ", ".join(cols)
                    copy_sql = f"COPY timeseries_telemetry ({col_str}) FROM STDIN WITH (FORMAT csv, DELIMITER '\t', HEADER true)"
                    with open(TIMESERIES_PATH, "r", encoding="utf-8") as f:
                        cur.copy_expert(copy_sql, f)
                raw_conn.commit()
                print(f"✓ Streamed {len(df_ts)} timeseries rows via binary COPY in {time.time() - t1:.2f}s!")
            except Exception as e:
                print(f"Fast COPY failed ({e}), falling back to standard dataframe to_sql...")
                df_ts.to_sql(
                    "timeseries_telemetry",
                    con=engine,
                    if_exists="append",
                    index=False,
                    chunksize=10000,
                )
                print(f"✓ Inserted {len(df_ts)} rows via fallback in {time.time() - t1:.2f}s.")
            finally:
                raw_conn.close()
        else:
            print(f"✓ Table 'timeseries_telemetry' already contains {count} rows. Skipping insert.")

    # Verification query
    with engine.connect() as conn:
        n_p = conn.execute(text("SELECT COUNT(*) FROM patients")).scalar()
        n_h = conn.execute(text("SELECT COUNT(*) FROM patient_history")).scalar()
        n_e = conn.execute(text("SELECT COUNT(*) FROM clinical_events")).scalar()
        n_t = conn.execute(text("SELECT COUNT(*) FROM timeseries_telemetry")).scalar()

    total_time = time.time() - start_time
    print("\n" + "=" * 60)
    print(" PostgreSQL Migration Verification:")
    print(f" • Patients: {n_p:,} records")
    print(f" • Patient History: {n_h:,} records")
    print(f" • Clinical Events: {n_e:,} records")
    print(f" • Timeseries Telemetry: {n_t:,} data points")
    print(f" Total Migration Time: {total_time:.2f} seconds")
    print("=" * 60)


if __name__ == "__main__":
    run_migration()
