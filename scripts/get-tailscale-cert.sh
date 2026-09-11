#!/usr/bin/env bash
# One-time (and periodic-renewal) step for the self-hosted production setup: fetches a real,
# browser-trusted HTTPS certificate for this machine's Tailscale hostname, valid only within your
# tailnet — no public domain, no Let's Encrypt, no port-forwarding required.
#
# Prerequisite: HTTPS Certificates must be enabled for your tailnet once, in the admin console —
# https://login.tailscale.com/admin/dns → "HTTPS Certificates" → enable.
#
# Usage: ./scripts/get-tailscale-cert.sh
# Re-run this periodically (e.g. a monthly cron/scheduled task) — Tailscale certs expire like
# Let's Encrypt ones (~90 days) and are not renewed automatically by this script.

set -euo pipefail

HOSTNAME=$(tailscale status --self --json | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).Self.DNSName.replace(/\.$/,'')))")

if [ -z "$HOSTNAME" ]; then
  echo "Could not determine this machine's Tailscale hostname. Is Tailscale running and MagicDNS enabled?" >&2
  exit 1
fi

echo "Fetching cert for: $HOSTNAME"
mkdir -p certs
tailscale cert --cert-file certs/tailscale.crt --key-file certs/tailscale.key "$HOSTNAME"

echo ""
echo "Done. Use this as TS_HOSTNAME:"
echo "  TS_HOSTNAME=$HOSTNAME docker compose -f docker-compose.prod.yml up -d --build"
