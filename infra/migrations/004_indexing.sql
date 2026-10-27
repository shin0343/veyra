-- Versioned segment checkpoints; creation does not authorize cloud transfer.
ALTER TABLE analysis_jobs ADD COLUMN pipeline_version text NOT NULL DEFAULT 'legacy';
ALTER TABLE analysis_jobs ADD COLUMN lease_token uuid;
ALTER TABLE analysis_jobs ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE analysis_jobs ADD COLUMN processing_ms bigint NOT NULL DEFAULT 0;
ALTER TABLE analysis_jobs ADD COLUMN selected_segments integer NOT NULL DEFAULT 0;
ALTER TABLE analysis_jobs ADD COLUMN selected_duration_ms bigint NOT NULL DEFAULT 0;

CREATE TABLE segment_indexes (
    segment_id uuid NOT NULL REFERENCES segments(id),
    pipeline_version text NOT NULL,
    analysis_job_id uuid REFERENCES analysis_jobs(id),
    state text NOT NULL DEFAULT 'waiting'
        CHECK (state IN ('waiting','queued','running','succeeded','failed','cancelled')),
    error_code text,
    analyzed_start_ms bigint,
    analyzed_end_ms bigint,
    media_info jsonb NOT NULL DEFAULT '{}'::jsonb,
    provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
    processing_ms bigint NOT NULL DEFAULT 0 CHECK (processing_ms >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (segment_id, pipeline_version),
    CHECK ((analyzed_start_ms IS NULL AND analyzed_end_ms IS NULL) OR
           (analyzed_start_ms >= 0 AND analyzed_end_ms > analyzed_start_ms))
);
CREATE INDEX segment_indexes_job ON segment_indexes(analysis_job_id, state);

ALTER TABLE video_metadata ADD COLUMN objects jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE video_metadata ADD COLUMN event_types text[] NOT NULL DEFAULT '{}';
ALTER TABLE video_metadata ADD COLUMN uncertainty text NOT NULL DEFAULT 'high'
    CHECK (uncertainty IN ('low','medium','high'));
ALTER TABLE video_metadata ADD COLUMN uncertainty_notes text NOT NULL DEFAULT '';
ALTER TABLE video_metadata ADD COLUMN provenance jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE video_metadata ADD COLUMN processing_state text NOT NULL DEFAULT 'succeeded'
    CHECK (processing_state IN ('succeeded','invalidated'));
CREATE INDEX video_metadata_objects ON video_metadata USING gin(objects jsonb_path_ops);
CREATE INDEX video_metadata_events ON video_metadata USING gin(event_types);
CREATE UNIQUE INDEX video_metadata_version_span ON video_metadata
    (segment_id, schema_version, model_id, (provenance->>'pipeline_version'),
     observation_start_ms, observation_end_ms);
ALTER TABLE events ADD COLUMN pipeline_version text NOT NULL DEFAULT 'legacy';

CREATE TABLE motion_samples (
    segment_id uuid NOT NULL REFERENCES segments(id),
    pipeline_version text NOT NULL,
    start_ms bigint NOT NULL CHECK (start_ms >= 0),
    end_ms bigint NOT NULL CHECK (end_ms > start_ms),
    score double precision NOT NULL CHECK (score BETWEEN 0 AND 1),
    active boolean NOT NULL,
    PRIMARY KEY (segment_id, pipeline_version, start_ms)
);

-- A request is reserved before external work. Unknown/failed bills retain reservation.
CREATE TABLE model_usage (
    id uuid PRIMARY KEY,
    analysis_job_id uuid REFERENCES analysis_jobs(id),
    operation text NOT NULL CHECK (operation IN ('video_analysis','search_intent','upload','delete')),
    model_id text NOT NULL,
    state text NOT NULL CHECK (state IN ('reserved','succeeded','failed')),
    reserved_usd numeric(12,6) NOT NULL CHECK (reserved_usd >= 0),
    estimated_usd numeric(12,6),
    input_tokens bigint,
    output_tokens bigint,
    bytes_uploaded bigint NOT NULL DEFAULT 0,
    elapsed_ms bigint NOT NULL DEFAULT 0,
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX model_usage_day ON model_usage(created_at);
CREATE INDEX model_usage_job ON model_usage(analysis_job_id);

-- Model metadata must stay within the real source and the job's recording.
CREATE FUNCTION validate_video_grounding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE segment_row segments; job_recording uuid;
BEGIN
    SELECT * INTO STRICT segment_row FROM segments WHERE id=NEW.segment_id;
    SELECT recording_id INTO STRICT job_recording FROM analysis_jobs WHERE id=NEW.analysis_job_id;
    IF segment_row.recording_id <> job_recording OR
       NEW.observation_end_ms > segment_row.duration_ms THEN
        RAISE EXCEPTION 'Invalid video metadata grounding' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER video_grounding BEFORE INSERT OR UPDATE ON video_metadata
    FOR EACH ROW EXECUTE FUNCTION validate_video_grounding();

CREATE FUNCTION validate_event_grounding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE segment_row segments; metadata_segment uuid;
BEGIN
    SELECT * INTO STRICT segment_row FROM segments WHERE id=NEW.segment_id;
    IF NEW.started_at < segment_row.started_at OR
       NEW.ended_at > segment_row.started_at + segment_row.duration_ms * interval '1 millisecond' OR
       NEW.evidence_offset_ms < segment_row.offset_ms OR
       NEW.evidence_offset_ms >= segment_row.offset_ms+segment_row.duration_ms THEN
        RAISE EXCEPTION 'Invalid event time' USING ERRCODE='23514';
    END IF;
    IF NEW.metadata_id IS NOT NULL THEN
        SELECT segment_id INTO STRICT metadata_segment FROM video_metadata WHERE id=NEW.metadata_id;
        IF metadata_segment <> NEW.segment_id THEN
            RAISE EXCEPTION 'Invalid event metadata' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER event_grounding BEFORE INSERT OR UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION validate_event_grounding();

-- Normalized public meaning without duplicating camera/recording/time source-of-truth columns.
CREATE VIEW indexed_video_observations AS SELECT v.*,r.camera_id,s.recording_id,
    s.started_at+v.observation_start_ms*interval '1 millisecond' AS started_at,
    s.started_at+v.observation_end_ms*interval '1 millisecond' AS ended_at,
    s.offset_ms+v.observation_start_ms AS recording_offset_ms
    FROM video_metadata v JOIN segments s ON s.id=v.segment_id
    JOIN recordings r ON r.id=s.recording_id;
