-- Muse turns share the same durable admission ceiling as video and search inference.
ALTER TABLE model_usage DROP CONSTRAINT model_usage_operation_check;
ALTER TABLE model_usage ADD CONSTRAINT model_usage_operation_check
    CHECK (operation IN ('video_analysis','search_intent','agent_turn','upload','delete'));
