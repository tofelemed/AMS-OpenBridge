#!/usr/bin/env bash
# audit-vm.sh — READ-ONLY inventory of the shared Marun VM (Instrumental host).
#
# Collects: host facts, time/DNS, docker containers/networks/ports/volumes/images,
# per-network DNS aliases (the collision check), host listening ports, the ports the
# CPA cut wants, Postgres databases + Timescale availability, Kafka topics/groups,
# Redis auth state, firewall/SELinux, and any ams/traverse leftovers.
#
# GUARANTEES: no writes, no restarts, no config changes, no internet. Every probe is
# a read (docker inspect/ps, ss, psql SELECT/\l, kafka --list/--describe, redis PING).
#
# Run:   bash migration/audit-vm.sh            (user in the docker group)
#        sudo bash migration/audit-vm.sh      (only improves ss/iptables detail)
# Output: vm-audit-<host>-<timestamp>.txt in the current directory — share that file.

set -uo pipefail   # deliberately no -e: a failed probe must not stop the inventory

OUT="vm-audit-$(hostname -s 2>/dev/null || echo host)-$(date +%Y%m%d_%H%M%S).txt"
exec > >(tee "$OUT") 2>&1

sec() { printf '\n===== %s =====\n' "$*"; }
try() { "$@" 2>&1 || echo "[unavailable] $*"; }

DOCKER="docker"
docker info >/dev/null 2>&1 || { sudo -n docker info >/dev/null 2>&1 && DOCKER="sudo docker"; }

echo "audit-vm.sh — read-only inventory — $(date -Is 2>/dev/null || date)"
echo "docker command: $DOCKER"

sec "HOST"
try uname -a
try cat /etc/os-release
echo "cpus: $(nproc 2>/dev/null || echo '?')"
try free -h
try df -h / /var/lib/docker
try uptime

sec "TIME SYNC (NTP)"
try timedatectl
try chronyc sources -n
try ntpq -p

sec "DNS RESOLVER (dead nameservers = container DNS timeouts)"
try cat /etc/resolv.conf
grep -v '^#' /etc/hosts 2>/dev/null || true
try resolvectl status

sec "DOCKER VERSIONS"
try $DOCKER version --format 'server={{.Server.Version}} client={{.Client.Version}}'
$DOCKER compose version 2>&1 || try docker-compose version
$DOCKER info 2>/dev/null | grep -Ei 'storage driver|docker root|cgroup|live-restore|containers:|images:' || true

sec "ALL CONTAINERS (name / image / status / restart policy)"
try $DOCKER ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
echo "--- restart policies ---"
$DOCKER ps -aq 2>/dev/null | xargs -r $DOCKER inspect -f '{{.Name}}  restart={{.HostConfig.RestartPolicy.Name}}  oom_kill_disable={{.HostConfig.OomKillDisable}}' 2>/dev/null || true

sec "PUBLISHED PORTS PER CONTAINER"
try $DOCKER ps -a --format '{{.Names}}\t=> {{.Ports}}'

sec "COMPOSE PROJECTS"
try $DOCKER compose ls -a

sec "DOCKER NETWORKS"
try $DOCKER network ls
for n in $($DOCKER network ls --format '{{.Name}}' 2>/dev/null); do
  echo "--- network: $n ---"
  $DOCKER network inspect "$n" -f '  driver={{.Driver}} subnet={{range .IPAM.Config}}{{.Subnet}} {{end}}' 2>/dev/null
  $DOCKER network inspect "$n" -f '{{range $id, $c := .Containers}}  member: {{$c.Name}} {{$c.IPv4Address}}{{println}}{{end}}' 2>/dev/null
done

sec "PER-CONTAINER NETWORK ALIASES (DNS collision check — the critical section)"
# Every name in 'aliases' + the compose service name is a DNS record on that network.
# We must not add duplicates of: auth-service, ingestion-service, redis, postgres, notification-service.
for c in $($DOCKER ps -a --format '{{.Names}}' 2>/dev/null); do
  $DOCKER inspect "$c" -f '{{.Name}}:{{range $net, $cfg := .NetworkSettings.Networks}}  [{{$net}}] ip={{$cfg.IPAddress}} aliases={{$cfg.Aliases}}{{end}}' 2>/dev/null
done
echo "--- compose service labels (service name = implicit DNS record) ---"
$DOCKER ps -a --format '{{.Names}}' 2>/dev/null | while read -r c; do
  svc=$($DOCKER inspect "$c" -f '{{index .Config.Labels "com.docker.compose.service"}}' 2>/dev/null)
  proj=$($DOCKER inspect "$c" -f '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null)
  hn=$($DOCKER inspect "$c" -f '{{.Config.Hostname}}' 2>/dev/null)
  echo "$c  project=$proj service=$svc hostname=$hn"
done

sec "HOST LISTENING PORTS (all)"
ss -tulpen 2>/dev/null || ss -tuln 2>/dev/null || try netstat -tulpen

sec "CPA PLANNED-PORT CHECK (taken = collision to resolve before compose-up)"
for p in 8081 8088 18083 8082 6667 8181 9091 9000 9001 9249 9250 1883 6380 9093 5433 3001 8085; do
  if ss -tln 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${p}\$"; then
    owner=$(ss -tlnp 2>/dev/null | grep -E "[:.]${p} " | head -1)
    echo "TAKEN  $p  ${owner:-'(rerun with sudo to see owner)'}"
  else
    echo "free   $p"
  fi
done

sec "VOLUMES"
try $DOCKER volume ls
echo "--- docker disk usage ---"
try $DOCKER system df

sec "IMAGES (watch for name clashes with ams-cpa-* / ams-*)"
try $DOCKER images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}'

sec "POSTGRES (read-only: version, databases, roles, Timescale availability)"
PGC=$($DOCKER ps --format '{{.Names}}' 2>/dev/null | grep -Ei 'postgres' | head -1)
if [ -n "${PGC:-}" ]; then
  echo "container: $PGC"
  PGUSER=$($DOCKER exec "$PGC" printenv POSTGRES_USER 2>/dev/null); PGUSER=${PGUSER:-postgres}
  echo "psql user: $PGUSER"
  try $DOCKER exec "$PGC" psql -U "$PGUSER" -Atc "select version();"
  echo "--- databases + sizes ---"
  try $DOCKER exec "$PGC" psql -U "$PGUSER" -Atc "select datname||'  '||pg_size_pretty(pg_database_size(datname)) from pg_database order by datname;"
  echo "--- roles ---"
  try $DOCKER exec "$PGC" psql -U "$PGUSER" -Atc "select rolname||' super='||rolsuper::text||' login='||rolcanlogin::text from pg_roles order by rolname;"
  echo "--- timescaledb available? (decides T1-lite) ---"
  try $DOCKER exec "$PGC" psql -U "$PGUSER" -Atc "select name||' default='||coalesce(default_version,'-')||' installed='||coalesce(installed_version,'no') from pg_available_extensions where name='timescaledb';"
  echo "--- connections / limits ---"
  try $DOCKER exec "$PGC" psql -U "$PGUSER" -Atc "select 'max_connections='||setting from pg_settings where name='max_connections';"
  try $DOCKER exec "$PGC" psql -U "$PGUSER" -Atc "select 'current_connections='||count(*) from pg_stat_activity;"
  echo "--- listen_addresses / hba summary (read) ---"
  try $DOCKER exec "$PGC" psql -U "$PGUSER" -Atc "select 'listen_addresses='||setting from pg_settings where name='listen_addresses';"
else
  echo "[no postgres container found]"
fi

sec "KAFKA (read-only: topics, traverse.* presence, consumer groups)"
KC=$($DOCKER ps --format '{{.Names}}' 2>/dev/null | grep -Ei 'kafka' | grep -Evi 'ui|exporter|zookeeper' | head -1)
if [ -n "${KC:-}" ]; then
  echo "container: $KC"
  KT="kafka-topics";  $DOCKER exec "$KC" which kafka-topics >/dev/null 2>&1 || KT="kafka-topics.sh"
  KG="kafka-consumer-groups"; $DOCKER exec "$KC" which kafka-consumer-groups >/dev/null 2>&1 || KG="kafka-consumer-groups.sh"
  BS=$($DOCKER exec "$KC" printenv KAFKA_ADVERTISED_LISTENERS 2>/dev/null | grep -oE '[a-zA-Z0-9._-]+:9092' | head -1); BS=${BS:-localhost:9092}
  echo "bootstrap: $BS"
  echo "--- topic count + full list ---"
  $DOCKER exec "$KC" $KT --bootstrap-server "$BS" --list 2>&1 | sed 's/^/  /' || echo "[topic list failed]"
  echo "--- traverse.* / ams.* topics already present? ---"
  $DOCKER exec "$KC" $KT --bootstrap-server "$BS" --list 2>/dev/null | grep -Ei '^(traverse|ams)' || echo "  none (good — clean slate)"
  echo "--- consumer groups ---"
  $DOCKER exec "$KC" $KG --bootstrap-server "$BS" --list 2>&1 | sed 's/^/  /' || echo "[group list failed]"
else
  echo "[no kafka broker container found]"
fi

sec "REDIS (auth state — PONG without password = open instance, do not share)"
RC=$($DOCKER ps --format '{{.Names}}' 2>/dev/null | grep -Ei 'redis' | grep -vi exporter | head -1)
if [ -n "${RC:-}" ]; then
  echo "container: $RC"
  R=$($DOCKER exec "$RC" redis-cli ping 2>&1)
  echo "unauthenticated PING => $R   (PONG means no requirepass)"
  try $DOCKER exec "$RC" redis-cli info server | grep -E 'redis_version|tcp_port'
else
  echo "[no redis container found]"
fi

sec "FIREWALL / SECURITY"
try ufw status verbose
firewall-cmd --state 2>&1 || true
iptables -S 2>/dev/null | head -30 || echo "[iptables needs sudo]"
getenforce 2>&1 || true
aa-status --enabled 2>/dev/null && echo "apparmor: enabled" || true

sec "EXISTING ams/traverse LEFTOVERS (prior attempts?)"
$DOCKER ps -a    --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -Ei 'ams|traverse' || echo "containers: none"
$DOCKER volume ls --format '{{.Name}}'            2>/dev/null | grep -Ei 'ams|traverse' || echo "volumes: none"
$DOCKER network ls --format '{{.Name}}'           2>/dev/null | grep -Ei 'ams|traverse' || echo "networks: none"
$DOCKER images   --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -Ei 'ams|traverse' || echo "images: none"

sec "DONE"
echo "Wrote: $OUT — share this file back for analysis."
