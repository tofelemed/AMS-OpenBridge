/**
 * Generate an RS256 keypair for stable JWT signing.
 *
 * Writes keys/jwt-private.pem (PKCS#8) and keys/jwt-public.pem (SPKI) under the
 * service root. Point the service at the private key with:
 *   JWT_PRIVATE_KEY_PATH=./keys/jwt-private.pem
 *
 * Usage: npm run keys:gen
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const keysDir = path.resolve(__dirname, '../../keys');
const privatePath = path.join(keysDir, 'jwt-private.pem');
const publicPath = path.join(keysDir, 'jwt-public.pem');

if (fs.existsSync(privatePath)) {
  console.log(`ℹ️  ${privatePath} already exists — leaving it untouched.`);
  process.exit(0);
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

fs.mkdirSync(keysDir, { recursive: true });
fs.writeFileSync(
  privatePath,
  privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  { mode: 0o600 }
);
fs.writeFileSync(
  publicPath,
  publicKey.export({ type: 'spki', format: 'pem' }).toString()
);

console.log('✅ RS256 keypair generated:');
console.log(`   private: ${privatePath}`);
console.log(`   public:  ${publicPath}`);
console.log('   Set JWT_PRIVATE_KEY_PATH=./keys/jwt-private.pem');
