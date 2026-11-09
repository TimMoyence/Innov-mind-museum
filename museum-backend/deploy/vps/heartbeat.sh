heartbeat() {
  local url="${!1:-}"
  if [ -z "${url}" ]; then
    echo "heartbeat non configuré : $1 est vide dans ${MUSAIUM_DIR}/backup.env" >&2
    return 0
  fi
  if [ "${2:-}" = fail ]; then
    curl -fsS --max-time 10 -X POST "${url}/fail"
  else
    curl -fsS --max-time 10 "${url}"
  fi
}
