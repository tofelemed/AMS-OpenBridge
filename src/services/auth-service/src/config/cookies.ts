/**
 * Refresh-token cookie configuration.
 *
 * The refresh token is delivered to browsers as a Secure, httpOnly, SameSite
 * cookie scoped to /api/auth — it is never readable by JS. The short-lived
 * access token is returned in the JSON body and held in memory by the client.
 */

import { Response } from 'express';

export const REFRESH_COOKIE = 'refresh_token';

const isProd = (process.env.NODE_ENV || 'development') === 'production';

// Secure cookies are not sent over plain HTTP, so default to false in dev.
const secure = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true'
  : isProd;

const sameSite = (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') || 'lax';
const cookiePath = process.env.COOKIE_PATH || '/api/auth';
const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite,
    path: cookiePath,
    maxAge: maxAgeMs,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure,
    sameSite,
    path: cookiePath,
  });
}
