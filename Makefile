PYTHON := .venv/bin/python -E
UV_CACHE_DIR := $(CURDIR)/.cache/uv
export UV_CACHE_DIR

.PHONY: install dev-api dev-web check contracts contracts-check media-smoke meta-smoke migrate agent-smoke agent-live-smoke agent-contracts
.PHONY: index-worker index-smoke index-live-smoke
install:
	uv sync --frozen
	npm ci --cache .cache/npm

dev-api:
	$(PYTHON) -m uvicorn veyra.main:app --app-dir apps/api --host 127.0.0.1 --port 8000 --reload

dev-web:
	node --env-file=.env node_modules/next/dist/bin/next dev apps/web --hostname 127.0.0.1

contracts:
	$(PYTHON) scripts/export_openapi.py
	npm run contracts:types

contracts-check:
	$(PYTHON) scripts/check_contracts.py
	$(PYTHON) scripts/export_agent_contracts.py --check

check:
	$(PYTHON) -m ruff check apps/api services/media services/worker scripts
	$(PYTHON) -m ruff format --check apps/api services/media services/worker scripts
	$(PYTHON) -m pytest -q
	npm run typecheck
	$(MAKE) contracts-check

migrate:
	$(PYTHON) scripts/migrate.py

meta-smoke:
	$(PYTHON) scripts/meta_smoke.py

agent-smoke:
	$(PYTHON) scripts/agent_acceptance.py

agent-live-smoke:
	$(PYTHON) scripts/agent_acceptance.py --require-live

agent-contracts:
	$(PYTHON) scripts/export_agent_contracts.py

index-worker:
	$(PYTHON) services/worker/main.py

index-smoke:
	$(PYTHON) scripts/index_acceptance.py

index-live-smoke:
	$(PYTHON) scripts/index_acceptance.py --require-live

media-smoke:
	$(PYTHON) scripts/media_smoke.py --mediamtx "$(MEDIAMTX_BIN)"

vms-smoke:
	$(PYTHON) scripts/vms_acceptance.py --mediamtx "$(MEDIAMTX_BIN)"

vms-native:
	$(PYTHON) scripts/vms_native.py --mediamtx "$(MEDIAMTX_BIN)"
