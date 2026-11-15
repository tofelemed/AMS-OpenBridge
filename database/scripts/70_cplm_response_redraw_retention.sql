-- CHG-199 (owner Q11): accepted System Response events keep their record and quantities 90 days (row RESPONSE) so the page can
-- redraw their trends from the historian (loop samples 90 d, CHG-198), and their stored charts 30 days (row RESPONSE_CHARTS,
-- read by cplm-api's evidence sweeper; no row = the charts live as long as the event). Plant upgrade: scripts/cpm-22.
-- Moves only the shipped 30 d (script 69), so an operator's own value survives a re-run.
\c traverse_cplm
UPDATE analytics.retention_policy SET days = 90 WHERE record_class = 'RESPONSE' AND days = 30;
INSERT INTO analytics.retention_policy (record_class, days) VALUES ('RESPONSE_CHARTS', 30)
    ON CONFLICT (record_class) DO NOTHING;
