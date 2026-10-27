FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY requirements.lock.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY apps/api apps/api
COPY services/worker services/worker
COPY scripts/migrate.py scripts/migrate.py
COPY infra/migrations infra/migrations
ENV PYTHONPATH=/app/apps/api PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN useradd --create-home --uid 10001 veyra
RUN mkdir -p /playback-cache /recordings && chown veyra:veyra /playback-cache /recordings
USER veyra
CMD ["uvicorn", "veyra.main:app", "--host", "0.0.0.0", "--port", "8000"]
