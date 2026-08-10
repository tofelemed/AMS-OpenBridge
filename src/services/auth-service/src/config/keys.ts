/**
 * JWT signing key configuration (RS256, asymmetric) with rotation overlap.
 *
 * The auth-service is the only holder of the PRIVATE key. Every validating
 * service (the .NET API and microservices) fetches the PUBLIC key(s) from the
 * JWKS endpoint (GET /api/auth/.well-known/jwks.json) and never sees the secret.
 *
 * Signing always uses the CURRENT key. To rotate without a flash of failed
 * validations, a PREVIOUS public key can be published alongside the current one:
 * tokens minted by either `kid` validate during the overlap window. See
 * `src/tools/rotate-keys.ts` and docs/runbooks/jwt-key-rotation.md.
 *
 * Current signing key source (in priority order):
 *   1. JWT_PRIVATE_KEY       - PEM string (literal newlines or "\n"-escaped)
 *   2. JWT_PRIVATE_KEY_PATH  - path to a PEM file
 *   3. dev fallback          - an ephemeral in-memory keypair (NON-production only)
 *
 * Previous (validation-only) public key source:
 *   1. JWT_PREVIOUS_PUBLIC_KEY       - public PEM string
 *   2. JWT_PREVIOUS_PUBLIC_KEY_PATH  - path to a public PEM file
 *   3. <keysDir>/jwt-previous-public.pem  - written by the rotation tool
 *
 * In production a current key MUST be provided; otherwise startup fails loudly.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
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

/** kid = first 16 chars of base64url(sha256(SPKI DER)), unless JWT_KEY_ID overrides. */
function computeKidFor(pub: crypto.KeyObject, override?: string): string {
  if (override && override.trim()) return override.trim();
  const der = pub.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('base64url').slice(0, 16);
}

/** Directory that holds the persisted keys (next to the current private key, or the repo keys dir). */
function keysDir(): string {
  const keyPath = process.env.JWT_PRIVATE_KEY_PATH;
  if (keyPath) return path.dirname(keyPath);
  return path.resolve(__dirname, '../../keys');
}

/** Public PEMs of PREVIOUS signing keys still inside their rotation grace window. */
function loadPreviousPublicPems(): string[] {
  const pems: string[] = [];

  const inline = process.env.JWT_PREVIOUS_PUBLIC_KEY;
  if (inline && inline.trim()) {
    pems.push(inline.includes('\\n') ? inline.replace(/\\n/g, '\n') : inline);
  }

  const explicit = process.env.JWT_PREVIOUS_PUBLIC_KEY_PATH;
  const conventional = path.join(keysDir(), 'jwt-previous-public.pem');
  const filePath = explicit && explicit.trim() ? explicit.trim() : conventional;
  if (fs.existsSync(filePath)) {
    pems.push(fs.readFileSync(filePath, 'utf8'));
  }

  return pems;
}

// ── Current signing key ──────────────────────────────────────────────────────
const { pem: privatePem, ephemeral } = loadPrivateKeyPem();
const privateKey = crypto.createPrivateKey(privatePem);
const publicKey = crypto.createPublicKey(privateKey);
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const kid = computeKidFor(publicKey, process.env.JWT_KEY_ID);

// ── Verification key set (current + any previous still in overlap) ───────────
interface VerificationKey {
  kid: string;
  key: crypto.KeyObject;
  publicPem: string;
}

const verificationKeys: VerificationKey[] = [{ kid, key: publicKey, publicPem }];

for (const pem of loadPreviousPublicPems()) {
  try {
    const pub = crypto.createPublicKey(pem);
    const prevKid = computeKidFor(pub, process.env.JWT_PREVIOUS_KEY_ID);
    if (!verificationKeys.some((v) => v.kid === prevKid)) {
      verificationKeys.push({
        kid: prevKid,
        key: pub,
        publicPem: pub.export({ type: 'spki', format: 'pem' }).toString(),
      });
      logger.info(`[keys] Previous signing key ${prevKid} published for rotation overlap.`);
    }
  } catch (err) {
    logger.error(`[keys] Failed to load a previous public key for rotation overlap: ${String(err)}`);
  }
}

export const keyConfig = {
  algorithm: ALGORITHM,
  /** CURRENT signing key — every new token is signed with this. */
  privateKey,
  /** CURRENT public key. */
  publicKey,
  publicPem,
  /** kid stamped into the `kid` header of newly-signed tokens. */
  kid,
  ephemeral,
};

/**
 * Resolve the public key a token should be verified against, by its `kid` header.
 * Falls back to the current key when the header carries no (or an unknown) kid —
 * the signature check then fails cleanly for a genuinely unknown key.
 */
export function publicKeyForKid(headerKid?: string): crypto.KeyObject {
  if (headerKid) {
    const match = verificationKeys.find((v) => v.kid === headerKid);
    if (match) return match.key;
  }
  return publicKey;
}

/**
 * JWKS document exposing every currently-valid public key (current + previous in
 * overlap) so validators can verify RS256 tokens signed by either key.
 */
export function getJwks(): { keys: Array<Record<string, unknown>> } {
  return {
    keys: verificationKeys.map((v) => ({
      ...(v.key.export({ format: 'jwk' }) as Record<string, unknown>),
      kid: v.kid,
      use: 'sig',
      alg: ALGORITHM,
    })),
  };
}
