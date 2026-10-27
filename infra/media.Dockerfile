FROM bluenviron/mediamtx:1.21.3 AS upstream
FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends iptables util-linux \
    && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --create-home veyra
COPY --from=upstream /mediamtx /mediamtx
COPY infra/mediamtx/mediamtx.yml /mediamtx.yml
COPY services/media /app/services/media
COPY apps/api/veyra/source_policy.py /app/apps/api/veyra/source_policy.py
RUN chmod +x /app/services/media/entrypoint.sh
ENV RECORDINGS_ROOT=/recordings MEDIA_EGRESS_GUARD_FILE=/media-policy/installed.json TZ=UTC
ENV MTX_PATHDEFAULTS_RECORDPATH=/recordings/%path/%Y-%m-%d_%H-%M-%S-%f_%z
ENV MTX_PATHDEFAULTS_RUNONRECORDSEGMENTCOMPLETE="python /app/services/media/finalize.py"
ENTRYPOINT ["/app/services/media/entrypoint.sh"]
