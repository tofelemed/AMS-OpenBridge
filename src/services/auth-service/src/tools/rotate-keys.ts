/**
 * Rotate the RS256 signing keypair with a validation overlap window.
 *
 * Rotation is two phases so that no in-flight token ever fails validation:
 *
 *   1. npm run keys:rotate            (start the overlap)
 *        - promotes the current public key to keys/jwt-previous-public.pem
 *        - generates a NEW current keypair (keys/jwt-private.pem + jwt-public.pem)
 *        - restart auth-service: it now SIGNS with the new key and PUBLISHES both
 *          the new and previous public keys in JWKS. Tokens minted by either key
 *          continue to validate.
 *
 *   2. npm run keys:rotate -- --finalize   (end the overlap, after the grace window)
 *        - deletes keys/jwt-previous-public.pem
 *        - restart auth-service: JWKS now publishes only the new key.
 *
 * The grace window MUST be at least the access-token TTL (JWT_EXPIRES_IN, 15m by
 * default). To also cover refresh tokens minted by the old key, extend it toward
 * the refresh TTL or force affected users to re-authenticate. See
 * docs/runbooks/jwt-key-rotation.md.
 *
 * Usage:
 *   npm run keys:rotate               # phase 1 — begin overlap
 *   npm run keys:rotate -- --finalize # phase 2 — retire the previous key
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const keysDir = process.env.JWT_PRIVATE_KEY_PATH
  ? path.dirname(process.env.JWT_PRIVATE_KEY_PATH)
  : path.resolve(__dirname, '../../keys');

const privatePath = path.join(keysDir, 'jwt-private.pem');
const publicPath = path.join(keysDir, 'jwt-public.pem');
const previousPublicPath = path.join(keysDir, 'jwt-previous-public.pem');

const finalize = process.argv.includes('--finalize');

function kidOf(pub: crypto.KeyObject): string {
  const der = pub.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('base64url').slice(0, 16);
}

if (finalize) {
  if (fs.existsSync(previousPublicPath)) {
    fs.rmSync(previousPublicPath);
    console.log(`✅ Retired the previous signing key (${previousPublicPath} removed).`);
    console.log('   Restart auth-service — JWKS now publishes only the current key.');
  } else {
    console.log('ℹ️  No previous key to retire — nothing to do.');
  }
  process.exit(0);
}

// ── Phase 1: begin overlap ───────────────────────────────────────────────────
fs.mkdirSync(keysDir, { recursive: true });

if (fs.existsSync(privatePath)) {
  // Promote the outgoing public key so JWKS keeps validating tokens it signed.
  const currentPub = crypto
    .createPublicKey(fs.readFileSync(privatePath, 'utf8'))
    .export({ type: 'spki', format: 'pem' })
    .toString();
  fs.writeFileSync(previousPublicPath, currentPub);
  const prevKid = kidOf(crypto.createPublicKey(currentPub));
  console.log(`↩️  Promoted current key to previous (kid ${prevKid}) for the overlap window.`);
} else {
  console.log('ℹ️  No existing key found — generating the first keypair (no overlap needed).');
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
fs.writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), {
  mode: 0o600,
});
fs.writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }).toString());

console.log(`✅ New current signing key generated (kid ${kidOf(publicKey)}).`);
console.log('   Restart auth-service. It will sign with the new key and publish BOTH keys in JWKS.');
console.log('   After the grace window (≥ JWT_EXPIRES_IN), run: npm run keys:rotate -- --finalize');
