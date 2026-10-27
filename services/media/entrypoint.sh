#!/bin/sh
set -eu
mkdir -p /recordings /media-policy
chown 10001:10001 /recordings
python /app/services/media/egress_guard.py
exec setpriv --reuid=10001 --regid=10001 --init-groups --bounding-set=-all \
  --inh-caps=-all --ambient-caps=-all python /app/services/media/launch.py
