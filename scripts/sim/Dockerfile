# AMS live-data simulator (ams-sim). Publishes changing process values for the 2-site plant to Kafka
# live.metrics; the sparkplug-edge-node bridges them to EMQX (Sparkplug B DDATA) + Redis snapshots, so
# the whole live plane has data for the HMI and the calculation pipeline to consume.
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY process_value_sim.py limit_watchdog.py ./
# Overridable via `command:` in compose; defaults to continuous both-site publishing at 2s.
ENTRYPOINT ["python", "process_value_sim.py"]
CMD ["--bootstrap", "kafka:9092", "--interval", "2"]
