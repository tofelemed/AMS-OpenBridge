-- CHG-105: the System Response (G12) charts of an accepted event live as long as the event (plant upgrade: scripts/cpm-21).
-- cplm-api's evidence sweeper moves them from TRANSIENT (6 h) to class RESPONSE, which follows retention_policy row RESPONSE:
-- days = how long an accepted event, its quantities and its charts are kept; max_bytes = cap on the charts (oldest first).
-- Moves only the shipped CHG-049 default (14 d, no cap) to 30 d / 2 GiB, so an operator's own values survive a re-run.
\c traverse_cplm
ALTER TABLE analytics.retention_policy ADD COLUMN IF NOT EXISTS max_bytes bigint;
INSERT INTO analytics.retention_policy (record_class, days, max_bytes) VALUES ('RESPONSE', 30, 2147483648)
    ON CONFLICT (record_class) DO NOTHING;
UPDATE analytics.retention_policy SET days = 30, max_bytes = 2147483648
WHERE record_class = 'RESPONSE' AND days = 14 AND max_bytes IS NULL;
