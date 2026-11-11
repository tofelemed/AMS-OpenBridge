/**
 * CHG-171 fix 4 — deleted users stay on the gateway's revocation feed.
 *
 * The gateway (src/services/gateway/Auth/RevocationCache.cs) polls GET /internal/revocations
 * every few seconds, REBUILDS its snapshot from each answer, and rejects a signature-valid token
 * whose subject is listed with is_active = false. A deleted user has no row left, so the feed
 * lists them from this tombstone list, as inactive, until every access token they could still
 * hold has expired (the access-token lifetime plus a clock-skew margin).
 *
 * In memory, by decision: no schema migration. Limit: a restart of auth-service inside that
 * window forgets the tombstone, and the deleted user's last access token is then accepted at
 * the gateway until it expires (as before CHG-171). Refresh is impossible either way: the
 * user's refresh tokens are deleted with the row. auth-service runs as one instance.
 */
import { parseDuration } from '../utils/duration';

const SKEW_MARGIN_MS = 5 * 60 * 1000;
/** If JWT_EXPIRES_IN cannot be read, keep tombstones a full day rather than too short. */
const UNREADABLE_LIFETIME_MS = 24 * 60 * 60 * 1000;

export interface Tombstone {
  user_id: string;
  /** Deletion time, epoch seconds (the feed's `changed`). */
  changed: number;
}

export class RevocationTombstones {
  private readonly entries = new Map<string, number>(); // user_id -> deleted at (ms)

  constructor(readonly retentionMs: number) {}

  record(userId: string, atMs: number = Date.now()): void {
    this.entries.set(userId, atMs);
  }

  /** Tombstones still inside the retention window; expired ones are dropped. */
  live(nowMs: number = Date.now()): Tombstone[] {
    const out: Tombstone[] = [];
    for (const [userId, at] of this.entries) {
      if (nowMs - at > this.retentionMs) this.entries.delete(userId);
      else out.push({ user_id: userId, changed: Math.floor(at / 1000) });
    }
    return out;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const revocationTombstones = new RevocationTombstones(
  parseDuration(process.env.JWT_EXPIRES_IN || '1h', UNREADABLE_LIFETIME_MS) + SKEW_MARGIN_MS
);
