import { Request } from 'express';
import { Actor } from '../types';

/**
 * The signed-in user from the verified token (authenticateToken sets req.user). Routes that
 * change users or roles all sit behind authenticateToken, so the subject is always present.
 */
export function actorFromRequest(req: Request): Actor {
  const u = req.user;
  return {
    user_id: u?.sub || u?.user_id || '',
    username: u?.preferred_username || u?.username || '',
  };
}
