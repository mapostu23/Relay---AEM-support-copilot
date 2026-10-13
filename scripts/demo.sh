#!/usr/bin/env bash
# Run from any directory. Missing Node is installed locally, without sudo.
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-}" in
  --help|-h) echo 'Usage: bash scripts/demo.sh [--skip-ollama] [--no-open]'; exit 0 ;;
esac
for arg in "$@"; do
  case "$arg" in --skip-ollama|--no-open) ;; *) echo "Unknown option: $arg" >&2; exit 1 ;; esac
done
node_ok() {
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 &&
    node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22 || a===22 && b>=13 ? 0 : 1)'
}
if ! node_ok; then
  export PATH="$PWD/.runtime/tools/node/bin:$PATH"
fi
if ! node_ok; then
  for tool in curl tar; do
    command -v "$tool" >/dev/null || { echo "Install $tool first, then rerun." >&2; exit 1; }
  done
  case "$(uname -s)" in Darwin) platform=darwin ;; Linux) platform=linux ;; *) echo 'Use macOS, Linux or WSL. Native Windows is not supported by this script.' >&2; exit 1 ;; esac
  case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64) arch=x64 ;; *) echo 'Unsupported CPU architecture.' >&2; exit 1 ;; esac
  mkdir -p .runtime/tools
  task_tmp="$(mktemp -d "$PWD/.runtime/tools/node-download.XXXXXX")"
  trap 'rm -rf "$task_tmp"' EXIT
  echo 'Installing Node.js 24 LTS into .runtime/tools/node...'
  curl -fL --retry 2 --connect-timeout 20 -o "$task_tmp/sums" https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt
  archive="$(awk -v suffix="-$platform-$arch.tar.gz" '$2 ~ (suffix "$") {print $2; exit}' "$task_tmp/sums")"
  [ -n "$archive" ] || { echo 'No compatible Node download found.' >&2; exit 1; }
  version="${archive%-${platform}-${arch}.tar.gz}"
  curl -fL --retry 2 --connect-timeout 20 -o "$task_tmp/$archive" "https://nodejs.org/dist/${version#node-}/$archive"
  expected="$(awk -v name="$archive" '$2==name {print $1}' "$task_tmp/sums")"
  if command -v shasum >/dev/null; then
    actual="$(shasum -a 256 "$task_tmp/$archive" | awk '{print $1}')"
  elif command -v sha256sum >/dev/null; then
    actual="$(sha256sum "$task_tmp/$archive" | awk '{print $1}')"
  else echo 'Install shasum or sha256sum first.' >&2; exit 1; fi
  [ "$actual" = "$expected" ] || { echo 'Node checksum verification failed.' >&2; exit 1; }
  mkdir "$task_tmp/node"
  tar -xzf "$task_tmp/$archive" --strip-components=1 -C "$task_tmp/node"
  # Replace only this script's private installation, never a system runtime.
  rm -rf .runtime/tools/node
  mv "$task_tmp/node" .runtime/tools/node
  rm -rf "$task_tmp"
  trap - EXIT
fi
exec node scripts/demo.mjs "$@"
