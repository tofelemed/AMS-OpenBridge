/**
 * JWT signing key configuration (RS256, asymmetric).
 *
 * The auth-service is the only holder of the PRIVATE key. Every validating
 * service (the .NET API and microservices) fetches the PUBLIC key from the
 * JWKS endpoint (GET /api/auth/.well-known/jwks.json) and never sees the secret.
 *
 * Key source (in priority order):
 *   1. JWT_PRIVATE_KEY       - PEM string (literal newlines or "\n"-escaped)
 *   2. JWT_PRIVATE_KEY_PATH  - path to a PEM file
 *   3. dev fallback          - an ephemeral in-memory keypair (NON-production only)
 *
 * In production a key MUST be provided; otherwise startup fails loudly.
 */

import crypto from 'crypto';
import fs from 'fs';
import logger from './logger';

const ALGORITHM = 'RS256' as const;
const NODE_ENV = process.env.NODE_ENV || 'development';

function loadPrivateKeyPem(): { pem: string; ephemeral: boolean } {
  const inline = process.env.JWT_PRIVATE_KEY;
  const keyPath = process.env.JWT_PRIVATE_KEY_PATH;

  if (inline && inline.trim()) {
    const pem = inline.includes('\\n') ? inline.replace(/\\n/g, '\n') : inline;
    return { pem, ephemeral: false };
  }

  if (keyPath && fs.existsSync(keyPath)) {
    return { pem: fs.readFileSync(keyPath, 'utf8'), ephemeral: false };
  }

  if (NODE_ENV === 'production') {
    throw new Error(
      'JWT_PRIVATE_KEY or JWT_PRIVATE_KEY_PATH is required in production (RS256).'
    );
  }

  // Development convenience: generate an ephemeral keypair so the service runs
  // out of the box. Tokens (incl. stored refresh tokens) will NOT survive a
  // restart because the key changes — set JWT_PRIVATE_KEY for a stable dev key.
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  logger.warn(
    '[keys] No JWT_PRIVATE_KEY configured — generated an EPHEMERAL RS256 dev key. ' +
      'Tokens will be invalidated on restart. Provide JWT_PRIVATE_KEY for stable signing.'
  );
  return { pem, ephemeral: true };
}

const { pem: privatePem, ephemeral } = loadPrivateKeyPem();
const privateKey = crypto.createPrivateKey(privatePem);
const publicKey = crypto.createPublicKey(privateKey);
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function computeKid(): string {
  const configured = process.env.JWT_KEY_ID;
  if (configured && configured.trim()) return configured.trim();
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('base64url').slice(0, 16);
}

const kid = computeKid();

export const keyConfig = {
  algorithm: ALGORITHM,
  privateKey,
  publicKey,
  publicPem,
  kid,
  ephemeral,
};

/**
 * JWKS document exposing the public key so validators can verify RS256 tokens.
 */
export function getJwks(): { keys: Array<Record<string, unknown>> } {
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  return {
    keys: [
      {
        ...jwk,
        kid,
        use: 'sig',
        alg: ALGORITHM,
      },
    ],
  };
}
