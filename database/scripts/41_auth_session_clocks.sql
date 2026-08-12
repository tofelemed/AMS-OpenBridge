-- 41: Dual-clock session policy columns (sliding idle + absolute max).
--
-- last_used_at       — sliding idle clock: set at login, bumped on every successful
--                      /refresh rotation. NEVER bumped by ordinary API traffic.
-- session_started_at — absolute clock: set at login, never updated afterwards.
--
-- Both are read with COALESCE(col, created_at) so rows that predate this
-- migration age from their creation time instead of being immortal.
--
-- NOTE (lab): scripts under database/scripts/ do NOT auto-apply to an existing
-- postgres volume — run this manually against the live traverse_auth database.
\c traverse_auth

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS last_used_at       TIMESTAMPTZ;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ;
