import type { Db } from './access-guard';

/**
 * Revoke all live access + refresh tokens for a user (Phase 3). Bumps the
 * credentials_changed_at epoch (the gateway and verifyToken reject older access tokens)
 * and deletes stored refresh tokens (blocks silent re-mint). `db` may be a transaction client.
 */
export async function revokeUserTokens(db: Db, userId: string): Promise<void> {
  await db.query('UPDATE users SET credentials_changed_at = NOW() WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}
