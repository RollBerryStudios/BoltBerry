#!/usr/bin/env bash
# register-org-runner.sh
# Register a GitHub Actions self-hosted runner at the RollBerry-Studios org level.
# Run this on each Proxmox VM that should execute CI/CD jobs.
#
# Org-level runners are shared across ALL repos in RollBerry-Studios automatically.
# No per-repo registration needed — just set the correct labels below.
#
# Usage:
#   1. On your dev machine, generate a fresh token:
#        gh api -X POST orgs/RollBerry-Studios/actions/runners/registration-token --jq '.token'
#      Tokens expire after 1 hour.
#
#   2. Copy this script to the target VM and run it:
#        bash register-org-runner.sh <TOKEN> <RUNNER_NAME> <LABELS>
#
#   Examples:
#        bash register-org-runner.sh ABCXYZ123 proxmox-ubuntu-01 "self-hosted,Linux,X64"
#        bash register-org-runner.sh ABCXYZ123 proxmox-win11-01  "self-hosted,Windows,X64"
#        bash register-org-runner.sh ABCXYZ123 friday-m4         "self-hosted,macOS,ARM64,apple-silicon"

set -euo pipefail

ORG="RollBerry-Studios"
RUNNER_DIR="${HOME}/actions-runner"

TOKEN="${1:-}"
RUNNER_NAME="${2:-$(hostname -s)}"
LABELS="${3:-self-hosted,Linux,X64}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: registration token required as first argument."
  echo "       Generate one with:"
  echo "       gh api -X POST orgs/${ORG}/actions/runners/registration-token --jq '.token'"
  exit 1
fi

ARCH=$(uname -m)
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

# Map to GitHub runner archive naming
case "${OS}" in
  linux)
    case "${ARCH}" in
      x86_64)  RUNNER_ARCH="x64" ;;
      aarch64) RUNNER_ARCH="arm64" ;;
      *)       echo "Unsupported arch: ${ARCH}"; exit 1 ;;
    esac
    RUNNER_OS="linux"
    ;;
  darwin)
    case "${ARCH}" in
      x86_64)  RUNNER_ARCH="x64" ;;
      arm64)   RUNNER_ARCH="arm64" ;;
      *)       echo "Unsupported arch: ${ARCH}"; exit 1 ;;
    esac
    RUNNER_OS="osx"
    ;;
  *)
    echo "Unsupported OS: ${OS}. For Windows, use the PowerShell instructions below."
    exit 1
    ;;
esac

RUNNER_VERSION="2.322.0"
ARCHIVE="actions-runner-${RUNNER_OS}-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
DOWNLOAD_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${ARCHIVE}"

echo "==> Installing runner ${RUNNER_NAME} for ${ORG} org"
echo "    OS: ${RUNNER_OS}, Arch: ${RUNNER_ARCH}, Labels: ${LABELS}"

mkdir -p "${RUNNER_DIR}"
cd "${RUNNER_DIR}"

if [[ ! -f "./run.sh" ]]; then
  echo "==> Downloading runner ${RUNNER_VERSION}..."
  curl -fsSL -o "${ARCHIVE}" "${DOWNLOAD_URL}"
  tar xzf "${ARCHIVE}"
  rm "${ARCHIVE}"
fi

echo "==> Configuring runner..."
./config.sh \
  --url "https://github.com/${ORG}" \
  --token "${TOKEN}" \
  --name "${RUNNER_NAME}" \
  --labels "${LABELS}" \
  --runnergroup "Default" \
  --unattended \
  --replace

echo "==> Installing as systemd service (Linux) or launchd (macOS)..."
if [[ "${RUNNER_OS}" == "linux" ]]; then
  sudo ./svc.sh install
  sudo ./svc.sh start
  sudo ./svc.sh status
elif [[ "${RUNNER_OS}" == "osx" ]]; then
  ./svc.sh install
  ./svc.sh start
  ./svc.sh status
fi

echo ""
echo "Runner '${RUNNER_NAME}' registered and running."
echo "Verify at: https://github.com/organizations/${ORG}/settings/actions/runners"

# ---------------------------------------------------------------------------
# WINDOWS (PowerShell) — run manually on the Win11 VM:
# ---------------------------------------------------------------------------
# $TOKEN = (gh api -X POST orgs/RollBerry-Studios/actions/runners/registration-token --jq '.token')
# mkdir C:\actions-runner; cd C:\actions-runner
# Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v2.322.0/actions-runner-win-x64-2.322.0.zip -OutFile runner.zip
# Expand-Archive runner.zip -DestinationPath .
# .\config.cmd --url https://github.com/RollBerry-Studios --token $TOKEN `
#              --name proxmox-win11-01 --labels "self-hosted,Windows,X64" `
#              --runnergroup Default --unattended --replace
# .\svc.ps1 install
# .\svc.ps1 start
