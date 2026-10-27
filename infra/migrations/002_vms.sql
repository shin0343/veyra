ALTER TABLE cameras ADD COLUMN group_name text CHECK (length(group_name) BETWEEN 1 AND 100);
ALTER TABLE cameras ADD COLUMN location text CHECK (length(location) BETWEEN 1 AND 100);
ALTER TABLE cameras ADD COLUMN connection_error_code text;
ALTER TABLE cameras ADD COLUMN deleted_at timestamptz;
ALTER TABLE cameras DROP CONSTRAINT cameras_source_id_key;
ALTER TABLE cameras DROP CONSTRAINT cameras_media_path_key;
CREATE UNIQUE INDEX cameras_active_source ON cameras(source_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX cameras_active_media_path ON cameras(media_path) WHERE deleted_at IS NULL;

CREATE TABLE vms_audit (
    id uuid PRIMARY KEY,
    principal_id text NOT NULL,
    operation text NOT NULL,
    resource_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE media_sessions (
    id uuid PRIMARY KEY,
    principal_id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('live','playback')),
    camera_id uuid NOT NULL REFERENCES cameras(id),
    recording_id uuid REFERENCES recordings(id),
    media_path text NOT NULL,
    resources jsonb NOT NULL DEFAULT '{}'::jsonb,
    cache_key text,
    actual_start_offset_ms bigint NOT NULL CHECK (actual_start_offset_ms >= 0),
    seek_offset_ms bigint NOT NULL CHECK (seek_offset_ms >= 0),
    expires_at timestamptz NOT NULL
);
CREATE INDEX media_sessions_expiry ON media_sessions(expires_at);
