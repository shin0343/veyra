-- PostgreSQL 15+; no model executes SQL. The migration runner is an operator tool.
CREATE TABLE cameras (
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    source_id text NOT NULL UNIQUE CHECK (source_id ~ '^[a-z0-9_-]{1,64}$'),
    media_path text NOT NULL UNIQUE CHECK (media_path ~ '^[a-zA-Z0-9_-]{1,80}$'),
    enabled boolean NOT NULL DEFAULT true,
    cloud_analysis_allowed boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'unknown'
        CHECK (status IN ('unknown','online','offline','error','disabled')),
    last_observed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recordings (
    id uuid PRIMARY KEY,
    camera_id uuid NOT NULL REFERENCES cameras(id),
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    status text NOT NULL CHECK (status IN ('recording','ready','failed','deleted')),
    available_duration_ms bigint NOT NULL DEFAULT 0 CHECK (available_duration_ms >= 0),
    UNIQUE (id, camera_id),
    CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE INDEX recordings_camera_time ON recordings(camera_id, started_at DESC, id);

CREATE TABLE segments (
    id uuid PRIMARY KEY,
    recording_id uuid NOT NULL REFERENCES recordings(id),
    storage_key text NOT NULL UNIQUE,
    started_at timestamptz NOT NULL,
    duration_ms bigint NOT NULL CHECK (duration_ms > 0),
    offset_ms bigint NOT NULL CHECK (offset_ms >= 0),
    status text NOT NULL CHECK (status IN ('ready','deleted','failed')),
    checksum_sha256 text,
    UNIQUE (recording_id, offset_ms),
    UNIQUE (id, recording_id)
);

CREATE TABLE layouts (
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    columns integer NOT NULL CHECK (columns IN (1,2,3)),
    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE layout_cells (
    layout_id uuid NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
    position integer NOT NULL CHECK (position BETWEEN 0 AND 8),
    camera_id uuid NOT NULL REFERENCES cameras(id),
    PRIMARY KEY (layout_id, position),
    UNIQUE (layout_id, camera_id)
);

CREATE TABLE rules (
    id uuid PRIMARY KEY,
    camera_id uuid NOT NULL REFERENCES cameras(id),
    name text NOT NULL,
    kind text NOT NULL CHECK (kind = 'motion'),
    enabled boolean NOT NULL DEFAULT false,
    config jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE analysis_jobs (
    id uuid PRIMARY KEY,
    recording_id uuid NOT NULL REFERENCES recordings(id),
    state text NOT NULL CHECK (state IN ('queued','running','succeeded','failed','cancelled')),
    progress double precision NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 1),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
    model_id text NOT NULL,
    prompt_version text NOT NULL,
    lease_expires_at timestamptz,
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analysis_jobs_claim ON analysis_jobs(state, created_at);
CREATE UNIQUE INDEX analysis_jobs_active ON analysis_jobs(recording_id)
    WHERE state IN ('queued','running');

CREATE TABLE video_metadata (
    id uuid PRIMARY KEY,
    segment_id uuid NOT NULL REFERENCES segments(id),
    analysis_job_id uuid NOT NULL REFERENCES analysis_jobs(id),
    summary text NOT NULL,
    evidence_text text NOT NULL,
    observation_start_ms bigint NOT NULL CHECK (observation_start_ms >= 0),
    observation_end_ms bigint NOT NULL,
    model_id text NOT NULL,
    prompt_version text NOT NULL,
    schema_version text NOT NULL,
    sampled_offsets_ms jsonb NOT NULL DEFAULT '[]'::jsonb,
    raw_output jsonb NOT NULL,
    indexed_at timestamptz NOT NULL DEFAULT now(),
    search_document tsvector GENERATED ALWAYS AS (
        to_tsvector('simple'::regconfig, summary || ' ' || evidence_text)
    ) STORED,
    CHECK (observation_end_ms > observation_start_ms)
);
CREATE INDEX video_metadata_search ON video_metadata USING gin(search_document);

CREATE TABLE events (
    id uuid PRIMARY KEY,
    camera_id uuid NOT NULL,
    recording_id uuid NOT NULL,
    segment_id uuid NOT NULL,
    rule_id uuid REFERENCES rules(id),
    metadata_id uuid REFERENCES video_metadata(id),
    kind text NOT NULL CHECK (kind IN ('motion','observation')),
    started_at timestamptz NOT NULL,
    ended_at timestamptz NOT NULL CHECK (ended_at > started_at),
    summary text NOT NULL,
    provenance text NOT NULL CHECK (provenance IN ('ffmpeg_motion','muse')),
    model_id text,
    evidence_offset_ms bigint NOT NULL CHECK (evidence_offset_ms >= 0),
    FOREIGN KEY (recording_id, camera_id) REFERENCES recordings(id, camera_id),
    FOREIGN KEY (segment_id, recording_id) REFERENCES segments(id, recording_id),
    CHECK (provenance != 'muse' OR (model_id IS NOT NULL AND metadata_id IS NOT NULL))
);
CREATE INDEX events_camera_time ON events(camera_id, started_at, id);

CREATE TABLE agent_runs (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL,
    principal_id text NOT NULL,
    state text NOT NULL CHECK (state IN ('running','completed','awaiting_confirmation','failed')),
    model_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agent_actions (
    id uuid PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES agent_runs(id),
    tool_call_id text NOT NULL,
    tool_name text NOT NULL,
    arguments jsonb NOT NULL,
    state text NOT NULL CHECK (state IN ('proposed','confirmation_required','succeeded','failed')),
    result jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, tool_call_id)
);
CREATE TABLE confirmations (
    id uuid PRIMARY KEY,
    action_id uuid NOT NULL UNIQUE REFERENCES agent_actions(id),
    principal_id text NOT NULL,
    arguments_sha256 text NOT NULL,
    expires_at timestamptz NOT NULL,
    decided_at timestamptz,
    approved boolean
);
CREATE TABLE idempotency_keys (
    principal_id text NOT NULL,
    operation text NOT NULL,
    key text NOT NULL,
    request_sha256 text NOT NULL,
    response_status integer,
    response_body jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (principal_id, operation, key)
);
