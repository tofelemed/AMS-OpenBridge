# V2 pipeline validator — runs the governance + compute + fidelity + authz suite against the running
# stack (on the ams-backend network). Run on demand: docker compose ... run --rm v2-validator
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY config.py validate_v2.py ./
ENTRYPOINT ["python", "validate_v2.py"]
