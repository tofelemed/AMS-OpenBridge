#!/usr/bin/env bash
# Strip CRLF, chmod +x, create deploy log dir. Run once on the Marun VM.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG="$ROOT/migration"

info() { printf '[INFO] %s\n' "$1"; }

strip_crlf() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  if grep -q $'\r' "$f" 2>/dev/null; then
    sed -i 's/\r$//' "$f"
    info "CRLF stripped: ${f#$ROOT/}"
  fi
}

info "prepare-vm root=$ROOT"
mkdir -p "$MIG/deploy/logs"
chmod u+w "$MIG/deploy/logs" || true

BUNDLE="${1:-}"
JAR_SRC=""
if [[ -n "$BUNDLE" && -f "$BUNDLE/ams-flink-1.0-SNAPSHOT.jar" ]]; then
  JAR_SRC="$BUNDLE/ams-flink-1.0-SNAPSHOT.jar"
elif [[ -f "$ROOT/offline-bundle/ams-flink-1.0-SNAPSHOT.jar" ]]; then
  JAR_SRC="$ROOT/offline-bundle/ams-flink-1.0-SNAPSHOT.jar"
fi
if [[ -n "$JAR_SRC" ]]; then
  mkdir -p "$ROOT/src/flink/target"
  cp "$JAR_SRC" "$ROOT/src/flink/target/ams-flink-1.0-SNAPSHOT.jar"
  info "Flink JAR → src/flink/target (cplm-api recompute mount)"
fi

while IFS= read -r -d '' f; do
  strip_crlf "$f"
  chmod +x "$f"
done < <(find "$MIG" -type f -name '*.sh' -print0)

chmod +x "$MIG/lib.sh" 2>/dev/null || true
info "scripts are executable; logs → $MIG/deploy/logs"
info "next: cp $MIG/.env.example $MIG/.env  &&  bash $MIG/deploy/deploy.sh --prod --no-build"
