#!/bin/sh
# Generate userlist.txt from environment variables at container startup.
# This avoids baking credentials into the image.
set -e

echo "\"${DB_USER}\" \"${DB_PASSWORD}\"" > /etc/pgbouncer/userlist.txt
chmod 600 /etc/pgbouncer/userlist.txt

exec pgbouncer /etc/pgbouncer/pgbouncer.ini
