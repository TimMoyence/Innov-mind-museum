#!/usr/bin/env bash
# capture-spki.sh — print SPKI SHA-256 base64 hashes for every cert in a host's chain.
#
# Usage:
#   ./scripts/capture-spki.sh musaium.com
#   ./scripts/capture-spki.sh api.example.com:443
#
# Output: one block per cert in the chain (leaf first), with subject + issuer +
# notAfter + SPKI hash. The hash format matches what `cert-pinning.ts`
# expects in `PROD_SPKI_HASHES`.
#
# See `museum-frontend/docs/CERT_PINNING_RUNBOOK.md` for the rotation
# procedure that consumes this output.

set -euo pipefail

if [[ "$#" -lt 1 ]]; then
  echo "usage: $0 <host>[:<port>]" >&2
  exit 64
fi

target="$1"
host="${target%:*}"
port="443"
if [[ "$target" == *:* ]]; then
  port="${target##*:}"
fi

if ! command -v openssl >/dev/null; then
  echo "openssl is required" >&2
  exit 69
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# Pull the full chain. -showcerts emits each cert as a PEM block.
openssl s_client -connect "${host}:${port}" -servername "${host}" -showcerts </dev/null 2>/dev/null \
  | awk '
      /-----BEGIN CERTIFICATE-----/ { n++; out="'"$tmpdir"'/cert-" n ".pem" }
      /-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/ { print > out }
    '

shopt -s nullglob
certs=("$tmpdir"/cert-*.pem)
if [[ "${#certs[@]}" -eq 0 ]]; then
  echo "no cert returned from ${host}:${port}" >&2
  exit 1
fi

echo "Chain for ${host}:${port} (leaf first) :"
echo

# Sort numerically so cert-1, cert-2, cert-10 come in order.
sorted_certs=$(printf '%s\n' "${certs[@]}" | sort -V)
i=0
while IFS= read -r pem; do
  i=$((i + 1))
  subject=$(openssl x509 -in "$pem" -noout -subject 2>/dev/null | sed 's/^subject= *//')
  issuer=$(openssl x509 -in "$pem" -noout -issuer 2>/dev/null | sed 's/^issuer= *//')
  not_after=$(openssl x509 -in "$pem" -noout -enddate 2>/dev/null | sed 's/^notAfter=//')
  spki=$(openssl x509 -in "$pem" -pubkey -noout 2>/dev/null \
          | openssl pkey -pubin -outform DER 2>/dev/null \
          | openssl dgst -sha256 -binary 2>/dev/null \
          | openssl enc -base64)
  label="leaf"
  if [[ "$i" -gt 1 ]]; then label="intermediate #$((i - 1))"; fi

  printf '#%d %s\n' "$i" "$label"
  printf '   subject  : %s\n' "$subject"
  printf '   issuer   : %s\n' "$issuer"
  printf '   notAfter : %s\n' "$not_after"
  printf '   spki     : %s\n' "$spki"
  echo
done <<< "$sorted_certs"
