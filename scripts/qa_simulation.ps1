Write-Host "=========================================================="
Write-Host "AMS QA Architecture & End-to-End Simulation Test"
Write-Host "=========================================================="

Write-Host "1. Installing Python dependencies for simulator..."
pip install confluent-kafka

Write-Host "2. Waiting for Kafka to be ready (approx 15-30 seconds)..."
Start-Sleep -Seconds 15

Write-Host "3. Running SystemAll.txt Alarm Simulator..."
python e:\AMS\scripts\simulate_alarms.py

Write-Host "=========================================================="
Write-Host "Simulation Complete! QA Verification Steps:"
Write-Host "1. Check Kafka Topics for events: 'docker exec -it ams-kafka kafka-topics --bootstrap-server localhost:9092 --list'"
Write-Host "2. Check TimescaleDB for ingestion: 'docker exec -it ams-postgres psql -U ams_user -d ams -c `"SELECT count(*) FROM alarms.active_alarms;`"'"
Write-Host "3. Check Flink JobManager UI for correlation jobs: http://localhost:8082"
Write-Host "4. Check Grafana for live metrics: http://localhost:3001"
Write-Host "=========================================================="
