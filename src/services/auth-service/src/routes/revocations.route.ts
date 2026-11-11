/**
 * Internal: edge-revocation feed for the API gateway (Plan 04 §2).
 *
 * The gateway polls this every few seconds and rejects signature-valid tokens whose owner was
 * revoked (credentials_changed_at bump) or deactivated — the edge-only enforcement point.
 * Guarded by the internal service key; disabled if none is set.
 *
 * CHG-171: users deleted within the access-token lifetime are listed too (is_active = false),
 * from the in-memory tombstones, so a deleted user's session ends at once. Same contract:
 * { data: [{ user_id, changed, is_active }] } — the gateway needs no change.
 */
import { Request, Response } from 'express';
import pool from '../config/database';
import { revocationTombstones } from '../services/revocation-tombstones';

export async function revocationsHandler(req: Request, res: Response): Promise<void> {
  const serviceKey = process.env.TRAVERSE_SERVICE_KEY;
  if (!serviceKey) {
    res.status(404).json({ error: 'Internal endpoints disabled (no TRAVERSE_SERVICE_KEY).' });
    return;
  }
  if (req.header('X-Service-Key') !== serviceKey) {
    res.status(403).json({ error: 'Invalid service key.' });
    return;
  }

  // v2.5 lab finding (2026-09-17): ::bigint ROUNDS the epoch, so a user created at hh:mm:48.84 got changed = 49 and a token
  // issued in the same second (iat 48) read as revoked (gateway: iat < changed) - the first login after a credential change
  // failed with 401 until the next second. floor() makes "changed" the second the change happened in, which is what iat is.
  const since = Number.parseInt(String(req.query.sinceEpoch ?? ''), 10);
  const sinceEpoch = Number.isFinite(since) ? since : Math.floor(Date.now() / 1000) - 1800;

  try {
    const result = await pool.query(
      `SELECT user_id,
              floor(EXTRACT(EPOCH FROM credentials_changed_at))::bigint AS changed,
              is_active
         FROM users
        WHERE credentials_changed_at > to_timestamp($1)
           OR is_active = false`,
      [sinceEpoch]
    );
    const rows = result.rows.map((r) => ({
      user_id: r.user_id,
      changed: Number(r.changed) || 0,
      is_active: r.is_active !== false,
    }));
    const deleted = revocationTombstones.live().map((t) => ({ user_id: t.user_id, changed: t.changed, is_active: false }));
    res.status(200).json({ data: [...rows, ...deleted] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read revocations.' });
  }
}
