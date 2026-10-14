#!/usr/bin/env bash
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $# == 1 ]] || fail 'Usage: verify-release.sh EXTRACTED_RELEASE_DIRECTORY'
release=$(CDPATH= cd -- "$1" && pwd -P)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
cd "$release"
for path in api release.json source-files.sha256 source-status.txt SHA256SUMS web/index.html web/talk.html web/practice.html; do
  [[ -f $path && ! -L $path ]] || fail "Missing regular release file: $path"
done
[[ -x api && -s api && -s release.json && -s source-files.sha256 && -s SHA256SUMS ]] || fail 'Release contains an empty or nonexecutable required file'
[[ -s web/index.html && -s web/talk.html && -s web/practice.html ]] || fail 'Required web routes are empty'
[[ -d web/_expo && -d web/assets ]] || fail 'Static export bundles or assets are missing'
[[ -n $(find web/_expo -type f -name '*.js' -print -quit) ]] || fail 'Static export contains no JavaScript bundle'
[[ -n $(find web/assets -type f -print -quit) ]] || fail 'Static export contains no assets'
[[ -z $(find . -mindepth 1 ! -type f ! -type d -print -quit) ]] || fail 'Symlinks and nonregular payload entries are forbidden'
[[ -z $(find . -mindepth 1 -maxdepth 1 ! -name api ! -name web ! -name release.json ! -name source-files.sha256 ! -name source-status.txt ! -name SHA256SUMS -print -quit) ]] || fail 'Unexpected release root entry'
[[ -z $(find web -name '.env*' -print -quit) ]] || fail 'Dotenv files do not belong in a static release'
[[ $(od -An -tx1 -N6 api | tr -d ' \n') == 7f454c460201 ]] || fail 'API must be a little-endian ELF64 binary'
[[ $(od -An -tx1 -j18 -N2 api | tr -d ' \n') == 3e00 ]] || fail 'API must target Linux amd64'
python3 - <<'PY'
import hashlib
import json
import re
from pathlib import Path

def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate release metadata field')
        result[key] = value
    return result

def reject_constant(value):
    raise ValueError(f'Non-JSON numeric constant: {value}')

try:
    data = json.loads(Path('release.json').read_text(), object_pairs_hook=unique, parse_constant=reject_constant)
    if not isinstance(data, dict) or type(data.get('schemaVersion')) is not int or data['schemaVersion'] != 1:
        raise ValueError('Unsupported release manifest version')
    if not isinstance(data.get('gitSha'), str) or not re.fullmatch(r'(?:[0-9a-f]{40}|[0-9a-f]{64})', data['gitSha']):
        raise ValueError('Missing source Git identity')
    status = Path('source-status.txt').read_bytes()
    if type(data.get('dirty')) is not bool or data['dirty'] != bool(status):
        raise ValueError('Dirty flag does not match the recorded source status')
    if data.get('target') != 'linux/amd64' or data.get('frontendAPI') != 'same-origin':
        raise ValueError('Unexpected release target or frontend API mode')
    fingerprint = hashlib.sha256(Path('source-files.sha256').read_bytes() + status).hexdigest()
    if data.get('sourceFingerprint') != fingerprint:
        raise ValueError('Source fingerprint does not match the recorded inputs')
except (OSError, ValueError) as error:
    raise SystemExit(f'Invalid release metadata: {error}')
PY
while IFS= read -r line; do
  [[ $line =~ ^[0-9a-f]{64}\ [\ \*]\./[^[:cntrl:]]+$ ]] || fail 'Malformed checksum entry'
  path=${line:66}
  case "$path" in
    *\\*|*/../*|*/./*|*/..|./SHA256SUMS) fail 'Unsafe checksum path';;
    ./api|./release.json|./source-files.sha256|./source-status.txt|./web/*) ;;
    *) fail 'Unexpected checksum path';;
  esac
  [[ -f $path && ! -L $path ]] || fail "Missing checksummed file: $path"
  printf '%s\n' "$path"
done < SHA256SUMS | LC_ALL=C sort > "$work/expected"
find . -type f ! -path ./SHA256SUMS -print | LC_ALL=C sort > "$work/actual"
cmp -s "$work/expected" "$work/actual" || fail 'Checksum inventory must cover every payload file exactly once'
sha256sum --check --strict --quiet SHA256SUMS
printf 'Verified release layout, source identity, architecture, and checksums.\n'
