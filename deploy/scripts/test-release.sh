#!/usr/bin/env bash
set -euo pipefail

[[ $# -le 1 ]] || { printf 'Usage: test-release.sh [PREBUILT_LINUX_AMD64_API]\n' >&2; exit 1; }
script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
repo=$(CDPATH= cd -- "$script_dir/../.." && pwd -P)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
release=$work/release
mkdir -p "$release/web/_expo/static/js/web" "$release/web/assets"
if [[ $# == 1 ]]; then
  cp -- "$1" "$release/api"
else
  GOPROXY=off GOSUMDB=off CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go -C "$repo/services/api" build -trimpath -buildvcs=false -o "$release/api" ./cmd/api
fi
chmod 755 "$release/api"
cp "$release/api" "$work/original-api"
for name in index talk practice; do printf '<html>MoriiTalks</html>\n' > "$release/web/$name.html"; done
printf 'console.log("fixture");\n' > "$release/web/_expo/static/js/web/app.js"
printf 'asset\n' > "$release/web/assets/fixture.txt"
printf 'fixture source\n' | sha256sum > "$release/source-files.sha256"
printf ' M fixture\n' > "$release/source-status.txt"
fingerprint=$(cat "$release/source-files.sha256" "$release/source-status.txt" | sha256sum | cut -d ' ' -f 1)
cat > "$release/release.json" <<JSON
{
  "schemaVersion": 1,
  "gitSha": "0000000000000000000000000000000000000000",
  "dirty": true,
  "sourceFingerprint": "$fingerprint",
  "target": "linux/amd64",
  "frontendAPI": "same-origin"
}
JSON
cp "$release/release.json" "$work/original-release.json"
checksums() {
  (cd "$release" && find . -type f ! -path ./SHA256SUMS -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > SHA256SUMS)
}
reject() {
  if bash "$script_dir/verify-release.sh" "$release" > "$work/rejected.log" 2>&1; then
    printf 'Expected verification failure: %s\n' "$1" >&2
    exit 1
  fi
  printf 'PASS reject %s\n' "$1"
}
checksums
bash "$script_dir/verify-release.sh" "$release"
# Git Bash writes the standard binary marker, Linux defaults to the text marker.
(cd "$release" && find . -type f ! -path ./SHA256SUMS -print0 | LC_ALL=C sort -z | xargs -0 sha256sum --binary > SHA256SUMS)
bash "$script_dir/verify-release.sh" "$release"
printf 'PASS standard binary checksum markers\n'
sed -i 's/"dirty": true/"dirty": false/' "$release/release.json"
checksums
reject 'dirty source cannot claim a clean commit'
cp "$work/original-release.json" "$release/release.json"
printf 'not JSON\n' >> "$release/release.json"
checksums
reject 'malformed JSON metadata even with matching checksums'
cp "$work/original-release.json" "$release/release.json"
sed -i 's/"dirty": true/"dirty": true, "dirty": true/' "$release/release.json"
checksums
reject 'duplicate JSON metadata keys'
cp "$work/original-release.json" "$release/release.json"
checksums
printf 'corruption' >> "$release/api"
reject 'changed binary bytes'
cp "$work/original-api" "$release/api"
printf 'unlisted' > "$release/web/extra.txt"
reject 'unlisted payload file'
rm "$release/web/extra.txt"
printf 'unlisted' > "$release/web/SHA256SUMS"
reject 'nested checksum filename cannot escape inventory'
rm "$release/web/SHA256SUMS"
ln -s fixture.txt "$release/web/assets/link.txt"
reject 'symlink payload'
rm "$release/web/assets/link.txt"
printf '\267\000' | dd of="$release/api" bs=1 seek=18 conv=notrunc status=none
checksums
reject 'wrong ELF architecture even with matching checksums'
cp "$work/original-api" "$release/api"
checksums
printf '%064d  ../outside\n' 0 >> "$release/SHA256SUMS"
reject 'checksum path outside release'
checksums
cp "$release/source-status.txt" "$work/source-status"
printf 'different source state\n' > "$release/source-status.txt"
checksums
reject 'source identity mismatch even with matching payload checksums'
cp "$work/source-status" "$release/source-status.txt"
rm "$release/web/talk.html"
checksums
reject 'missing static route'
printf '<html>MoriiTalks</html>\n' > "$release/web/talk.html"
checksums
if [[ $(uname -s) == Linux && $(uname -m) == x86_64 ]]; then
  bash "$script_dir/smoke-release.sh" "$release" "${SMOKE_TEST_PORT:-18081}"
  bash "$script_dir/package-release.sh" "$work/archive" --from-stage "$release"
  (cd "$work/archive" && sha256sum --check --strict --quiet ./*.sha256)
  archive=$(find "$work/archive" -maxdepth 1 -name '*.tar.gz' -print -quit)
  mkdir "$work/extracted"
  tar -xzf "$archive" -C "$work/extracted"
  bash "$script_dir/verify-release.sh" "$work/extracted"
  printf 'PASS seal, archive checksum, extract, and verify round trip\n'
else
  printf 'SKIP execution smoke, this host is not Linux amd64.\n'
fi
printf 'Release verification tests passed.\n'
