# Build AMS CloudBeaver image with IoTDB driver enabled.
# Requires Docker. First build can take several minutes (pull + patch).
param(
  [string]$Tag = "ams-cloudbeaver:iotdb",
  [string]$CloudBeaverTag = "25.3.5",
  [string]$IoTdbJdbcVersion = "1.3.2"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Building $Tag (CloudBeaver $CloudBeaverTag, IoTDB JDBC $IoTdbJdbcVersion)..."
docker build `
  --build-arg "CLOUDBEAVER_TAG=$CloudBeaverTag" `
  --build-arg "IOTDB_JDBC_VERSION=$IoTdbJdbcVersion" `
  -t $Tag `
  $here

Write-Host "Done. Start with: docker compose -f infra/docker/docker-compose.yml up -d cloudbeaver"
Write-Host "UI: http://localhost:8978"
Write-Host "IoTDB connection: host=iotdb  port=6667  user=root  password=root  dialect=Tree"
