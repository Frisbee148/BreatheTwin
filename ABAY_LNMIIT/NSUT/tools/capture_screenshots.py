import asyncio
import json
import os
import subprocess
import time
import base64
import httpx
import websockets
from pathlib import Path

SCREENSHOTS_DIR = Path("/home/casp1an/Code/DigiTwin/docs/screenshots")
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

CHROME_BIN = "/usr/bin/google-chrome"
PORT = 9222

PAGES = [
    ("01_landing_hero", "http://localhost:3000/"),
    ("02_doctor_cohort_triage", "http://localhost:3000/patients"),
    ("03_digital_twin_3d_lung", "http://localhost:3000/patients/PT-8821"),
    ("04_conformal_forecast_shap", "http://localhost:3000/patients/PT-8821/forecast"),
    ("05_counterfactual_whatif_sandbox", "http://localhost:3000/patients/PT-8821/what-if"),
    ("06_clinical_note_adaptation_ewc", "http://localhost:3000/patients/PT-8821/adapt"),
    ("07_patient_portal_overview", "http://localhost:3000/patient-portal"),
    ("08_benchmarks_and_validation", "http://localhost:3000/benchmarks"),
    ("09_clinical_assumptions", "http://localhost:3000/assumptions"),
    ("10_role_based_login", "http://localhost:3000/login"),
]

async def send_and_wait(ws, method, params=None, req_id=1):
    msg = {"id": req_id, "method": method}
    if params:
        msg["params"] = params
    await ws.send(json.dumps(msg))
    while True:
        raw = await ws.recv()
        data = json.loads(raw)
        if data.get("id") == req_id:
            return data

async def capture_all():
    cmd = [
        CHROME_BIN,
        "--headless=new",
        "--enable-unsafe-swiftshader",
        "--no-sandbox",
        "--remote-debugging-port=9222",
        "--window-size=1600,1000",
        "--hide-scrollbars",
        "about:blank",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2.0)

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"http://127.0.0.1:{PORT}/json")
            tabs = resp.json()
            ws_url = tabs[0]["webSocketDebuggerUrl"]

        async with websockets.connect(ws_url, max_size=50_000_000) as ws:
            req_id = 1
            await send_and_wait(ws, "Page.enable", req_id=req_id)

            for name, url in PAGES:
                print(f"--> Navigating to {url} ...")
                req_id += 1
                await send_and_wait(ws, "Page.navigate", {"url": url}, req_id=req_id)

                # Wait for API fetch, React hydration, 3D Canvas WebGL render
                print(f"    Waiting 3.5s for page rendering & animations...")
                # While sleeping, drain incoming event notifications so buffer doesn't fill
                end_time = time.time() + 3.5
                while time.time() < end_time:
                    try:
                        await asyncio.wait_for(ws.recv(), timeout=0.2)
                    except asyncio.TimeoutError:
                        pass

                # Capture screenshot
                req_id += 1
                print(f"    Capturing screenshot {name} ...")
                data = await send_and_wait(ws, "Page.captureScreenshot", {"format": "png"}, req_id=req_id)
                img_bytes = base64.b64decode(data["result"]["data"])
                out_path = SCREENSHOTS_DIR / f"{name}.png"
                out_path.write_bytes(img_bytes)
                print(f"    ✓ Saved {out_path.name} ({len(img_bytes):,} bytes)")

    finally:
        proc.terminate()
        proc.wait()
        print("Done capturing all screenshots.")

if __name__ == "__main__":
    asyncio.run(capture_all())
