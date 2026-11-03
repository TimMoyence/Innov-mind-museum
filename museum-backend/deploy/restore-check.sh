#!/usr/bin/env bash
set -euo pipefail

S3_ENV_FILE="${1:?usage: deploy/restore-check.sh <fichier avec S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY>}"
. "$(dirname "$0")/vps/s3-env.sh"

container=musaium-restore-check
image="$(sed -n 's#^ *image: *\(pgvector/pgvector:.*\)$#\1#p' "$(dirname "$0")/docker-compose.prod.yml")"
prefix="s3://${S3_BUCKET}/backups/daily"

latest="$(s5cmd --endpoint-url "${S3_ENDPOINT}" ls "${prefix}/" | awk '{print $NF}' | grep '\.pgdump\.gpg$' | sort | tail -n 1)"
[ -n "${latest}" ]

trap 'docker rm -f "${container}" > /dev/null' EXIT
docker run -d --name "${container}" -e POSTGRES_PASSWORD=restore-check "${image}" > /dev/null
until docker exec "${container}" pg_isready -h 127.0.0.1 -U postgres > /dev/null; do sleep 1; done

s5cmd --endpoint-url "${S3_ENDPOINT}" cat "${prefix}/${latest}" \
  | gpg --batch --decrypt \
  | docker exec -i "${container}" pg_restore -U postgres -d postgres --no-owner --no-acl --exit-on-error

applied="$(docker exec "${container}" psql -U postgres -d postgres -tAc 'SELECT count(*) FROM migrations')"
echo "restore-check ${latest}: ${applied} migrations"
[ "${applied}" -gt 0 ]
