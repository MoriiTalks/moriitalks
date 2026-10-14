#!/usr/bin/env bash
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $# -ge 1 && $# -le 2 ]] || fail 'Usage: smoke-release.sh EXTRACTED_RELEASE_DIRECTORY [PORT]'
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || fail 'Execution smoke requires Linux amd64'
command -v curl >/dev/null || fail 'curl is required for the local smoke check'
port=${2:-18081}
[[ $port =~ ^[0-9]{4,5}$ && $port -ge 1024 && $port -le 65535 ]] || fail 'Use an unprivileged TCP port'
script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
release=$(CDPATH= cd -- "$1" && pwd -P)
bash "$script_dir/verify-release.sh" "$release"
work=$(mktemp -d)
pid=''
cleanup() {
  if [[ -n $pid ]]; then
    kill "$pid" 2>/dev/null || true
    for _ in {1..50}; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT
base=http://127.0.0.1:$port
if curl --noproxy '*' --silent --max-time 1 "$base/healthz" >/dev/null 2>&1; then
  fail 'Smoke port is already serving HTTP, choose another port'
fi
# No credentials or enablement flags are inherited, this check cannot contact AI providers.
env -i PATH="$PATH" API_ADDR="127.0.0.1:$port" "$release/api" > "$work/api.log" 2>&1 &
pid=$!
ready=false
for _ in {1..40}; do
  sleep 0.1
  if ! kill -0 "$pid" 2>/dev/null; then
    cat "$work/api.log" >&2
    fail 'Packaged API exited during smoke startup'
  fi
  if curl --noproxy '*' --fail --silent --max-time 1 "$base/healthz" > "$work/health.json"; then
    ready=true
    break
  fi
done
[[ $ready == true ]] || fail 'Packaged API did not become healthy'
tr -d '[:space:]' < "$work/health.json" | grep -Fq '"service":"moriitalks-api"' || fail 'Unexpected health response'
tr -d '[:space:]' < "$work/health.json" | grep -Fq '"status":"ok"' || fail 'API is not healthy'
for route in /v1/voice/config /v2/voice/config /v2/device-talk/config; do
  curl --noproxy '*' --fail --silent --show-error --max-time 2 "$base$route" > "$work/config.json"
  field=liveEnabled
  [[ $route != /v2/device-talk/config ]] || field=enabled
  python3 - "$work/config.json" "$field" <<'PY'
import json
import sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text())
if data.get(sys.argv[2]) is not False:
    raise SystemExit('Expected a disabled provider capability: ' + sys.argv[2])
PY
done
printf 'Local API smoke passed, all provider capabilities stayed disabled.\n'
