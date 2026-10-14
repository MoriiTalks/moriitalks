#!/usr/bin/env bash
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $# -ge 1 ]] || fail 'Usage: package-release.sh OUTPUT_DIRECTORY [--allow-dirty] [--prepare-only | --from-stage STAGE_DIRECTORY]'
output_argument=$1
shift
mode=build
allow_dirty=false
input_stage=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-dirty) allow_dirty=true; shift;;
    --prepare-only) [[ $mode == build ]] || fail 'Choose one packaging mode'; mode=prepare; shift;;
    --from-stage)
      [[ $mode == build && $# -ge 2 ]] || fail 'Choose one packaging mode and supply a stage directory'
      mode=assemble; input_stage=$2; shift 2;;
    *) fail "Unknown option: $1";;
  esac
done
[[ $mode != assemble || $allow_dirty == false ]] || fail '--allow-dirty belongs to a fresh build, its stage already records source state'
for tool in realpath sha256sum tar find sort xargs; do
  command -v "$tool" >/dev/null || fail "Missing build tool: $tool"
done
script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
repo=$(CDPATH= cd -- "$script_dir/../.." && pwd -P)
output=$(realpath -m -- "$output_argument")
case "$output/" in "$repo/"*) fail 'Output directory must be outside the source worktree';; esac
mkdir -p -- "$output"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
case "$work/" in "$repo/"*) fail 'Temporary directory must be outside the source worktree';; esac
mkdir "$work/before" "$work/after" "$work/release"
stage=$work/release

snapshot() {
  local destination=$1 path
  git status --porcelain=v1 --untracked-files=all > "$destination/source-status.txt"
  git ls-files --cached --others --exclude-standard -z -- \
    .nvmrc .gitattributes .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml \
    tsconfig.base.json apps/mobile packages/contracts content services/api deploy/scripts |
    LC_ALL=C sort -z |
    while IFS= read -r -d '' path; do
      [[ $path != *$'\n'* && $path != *\\* ]] || fail 'Unsupported source filename'
      [[ ! -L $path ]] || fail "Source symlinks are unsupported: $path"
      if [[ -e $path ]]; then
        [[ -f $path ]] || fail "Source input is not a regular file: $path"
        sha256sum -- "$path"
      fi
    done > "$destination/source-files.sha256"
}
if [[ $mode == assemble ]]; then
  [[ $(uname -s) == Linux ]] || fail 'Seal a prepared release on Linux or WSL'
  [[ -d $input_stage && ! -L $input_stage ]] || fail 'Prepared stage must be a real directory'
  input_stage=$(CDPATH= cd -- "$input_stage" && pwd -P)
  case "$output/" in "$input_stage/"*) fail 'Archive output must be outside the prepared stage';; esac
  [[ -z $(find "$input_stage" -mindepth 1 ! -type f ! -type d -print -quit) ]] || fail 'Prepared stage contains symlinks or nonregular entries'
  cp -R -- "$input_stage/." "$stage/"
  chmod 755 "$stage/api"
else
  for tool in git go node pnpm; do
    command -v "$tool" >/dev/null || fail "Missing build tool: $tool"
  done
  [[ $mode == prepare || $(uname -s) == Linux ]] || fail 'Use --prepare-only on Windows, then --from-stage on Linux or WSL'
  cd "$repo"
  revision=$(git rev-parse HEAD)
  snapshot "$work/before"
  dirty=false
  if [[ -s $work/before/source-status.txt ]]; then
    dirty=true
    [[ $allow_dirty == true ]] || fail 'Source has uncommitted changes, use --allow-dirty to record them explicitly'
  fi
  source_fingerprint=$(cat "$work/before/source-files.sha256" "$work/before/source-status.txt" | sha256sum | cut -d ' ' -f 1)

  # The web app uses its current origin, local dotenv files never enter a release build.
  unset EXPO_PUBLIC_VOICE_API_URL
  export EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 CI=1
  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go -C services/api build -trimpath -buildvcs=false -ldflags='-s -w' -o "$stage/api" ./cmd/api
  chmod 755 "$stage/api"
  pnpm --filter @moriitalks/mobile export:web --clear --max-workers 2 --output-dir "$stage/web"
  snapshot "$work/after"
  [[ $(git rev-parse HEAD) == "$revision" ]] || fail 'Git revision changed during the build'
  cmp -s "$work/before/source-files.sha256" "$work/after/source-files.sha256" &&
    cmp -s "$work/before/source-status.txt" "$work/after/source-status.txt" || fail 'Source changed during the build, rebuild a stable worktree'
  cp "$work/before/source-files.sha256" "$work/before/source-status.txt" "$stage/"
  BUILD_GIT_SHA=$revision BUILD_DIRTY=$dirty BUILD_SOURCE_FINGERPRINT=$source_fingerprint \
    BUILD_GO_VERSION="$(go version)" BUILD_PNPM_VERSION="$(pnpm --version)" \
    node --input-type=commonjs - "$stage/release.json" <<'NODE'
const fs = require('node:fs');
fs.writeFileSync(process.argv[2], JSON.stringify({
  schemaVersion: 1,
  gitSha: process.env.BUILD_GIT_SHA,
  dirty: process.env.BUILD_DIRTY === 'true',
  sourceFingerprint: process.env.BUILD_SOURCE_FINGERPRINT,
  sourceScope: 'Tracked and nonignored build inputs, plus repository working-tree status',
  builtAt: new Date().toISOString(),
  target: 'linux/amd64',
  frontendAPI: 'same-origin',
  goVersion: process.env.BUILD_GO_VERSION,
  nodeVersion: process.version,
  pnpmVersion: process.env.BUILD_PNPM_VERSION,
}, null, 2) + '\n');
NODE
  (
    cd "$stage"
    find . -type f ! -path ./SHA256SUMS -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > SHA256SUMS
  )
  if [[ $mode == prepare ]]; then
    [[ ! -e $output/stage ]] || fail 'Prepared stage already exists, choose a new output directory'
    mv -- "$stage" "$output/stage"
    printf 'Prepared fresh build: %s\nSeal it on Linux with: bash package-release.sh OUTPUT_DIRECTORY --from-stage STAGE_DIRECTORY\n' "$output/stage"
    exit 0
  fi
fi
bash "$script_dir/verify-release.sh" "$stage"
IFS=$'\t' read -r revision dirty source_fingerprint < <(python3 - "$stage/release.json" <<'PY'
import json
import sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text())
print(data['gitSha'], str(data['dirty']).lower(), data['sourceFingerprint'], sep='\t')
PY
)
payload=$(sha256sum "$stage/SHA256SUMS" | cut -c 1-12)
state=clean
[[ $dirty == false ]] || state=dirty
name=moriitalks-${revision:0:12}-$state-${source_fingerprint:0:12}-$payload.tar.gz
[[ ! -e $output/$name && ! -e $output/$name.sha256 ]] || fail 'This immutable release already exists'
tar -czf "$output/$name" -C "$stage" .
(cd "$output" && sha256sum "$name" > "$name.sha256")
printf 'Release: %s\nChecksum: %s\n' "$output/$name" "$output/$name.sha256"
