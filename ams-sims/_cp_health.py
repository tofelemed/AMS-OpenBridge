"""Checkpoint health sweep across all RUNNING jobs."""
import requests

jobs = requests.get("http://127.0.0.1:8082/jobs/overview", timeout=15).json()["jobs"]
for j in sorted((j for j in jobs if j["state"] == "RUNNING"), key=lambda j: j["name"]):
    c = requests.get(f"http://127.0.0.1:8082/jobs/{j['jid']}/checkpoints", timeout=15).json().get("counts", {})
    print(f"{j['name'][:42]:42} completed={c.get('completed',0):3} failed={c.get('failed',0):3} restored={c.get('restored',0)}")
