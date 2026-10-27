-- Durable model runs, request reservations and bound approval previews.
ALTER TABLE agent_runs ADD COLUMN user_message text NOT NULL DEFAULT '';
ALTER TABLE agent_runs ADD COLUMN response_body jsonb;
ALTER TABLE agent_runs ADD COLUMN deadline_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE agent_actions ADD COLUMN input_sha256 text;
ALTER TABLE agent_actions ADD COLUMN approval_context jsonb;

CREATE TABLE agent_requests (
    principal_id text NOT NULL,
    operation text NOT NULL,
    key text NOT NULL CHECK (length(key) BETWEEN 8 AND 128),
    request_sha256 text NOT NULL,
    run_id uuid NOT NULL REFERENCES agent_runs(id),
    response_body jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (principal_id, operation, key)
);
CREATE INDEX agent_runs_conversation ON agent_runs(principal_id, conversation_id, created_at DESC);
CREATE INDEX confirmations_expiry ON confirmations(expires_at) WHERE decided_at IS NULL;
