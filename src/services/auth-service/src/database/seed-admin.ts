/**
 * Bootstrap the first admin account.
 *
 * Reads credentials from the environment (never hardcoded):
 *   BOOTSTRAP_ADMIN_USERNAME  (default: admin)
 *   BOOTSTRAP_ADMIN_EMAIL     (default: admin@local)
 *   BOOTSTRAP_ADMIN_PASSWORD  (required)
 *
 * Idempotent: if the username already exists, it is left untouched.
 * Run once after `npm run migrate`:  npm run seed:admin
 */

import { Client } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432');
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'traverse_auth';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10');

const username = process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin';
const email = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@local';
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

async function main(): Promise<void> {
  if (!password) {
    console.error(
      '❌ BOOTSTRAP_ADMIN_PASSWORD is required. Set it in the environment and re-run.'
    );
    process.exit(1);
  }

  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });
  await client.connect();

  try {
    const existing = await client.query(
      'SELECT user_id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );
    if (existing.rows.length > 0) {
      console.log(
        `ℹ️  Admin user already exists (username="${username}"). No changes made.`
      );
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await client.query(
      `INSERT INTO users (username, email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, $4, 'Admin', TRUE)`,
      [username, email, passwordHash, 'System Administrator']
    );

    console.log('✅ Bootstrap admin created.');
    console.log(`   username: ${username}`);
    console.log(`   email:    ${email}`);
    console.log('   role:     Admin');
    console.log('   (password was taken from BOOTSTRAP_ADMIN_PASSWORD)');
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
