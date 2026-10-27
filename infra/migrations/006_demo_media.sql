-- Additive provenance snapshots. Existing media/index rows are deliberately untouched.
ALTER TABLE cameras ADD COLUMN source_media jsonb;
ALTER TABLE recordings ADD COLUMN source_media jsonb;
ALTER TABLE cameras ADD CONSTRAINT camera_source_media_object
    CHECK (source_media IS NULL OR jsonb_typeof(source_media) = 'object');
ALTER TABLE recordings ADD CONSTRAINT recording_source_media_object
    CHECK (source_media IS NULL OR jsonb_typeof(source_media) = 'object');
