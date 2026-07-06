/**
 * Database migration runner.
 *
 * 1. Connects to the maintenance database (default: postgres) and CREATEs the
 *    target database (default: traverse_auth) if it does not already exist.
 * 2. Connects to the target database and applies database/schema.sql
 *    (idempotent — safe to re-run).
 *
 * Usage: npm run migrate
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432');
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'traverse_auth';
const ADMIN_DB = process.env.DB_ADMIN_DB || 'postgres';

async function ensureDatabase(): Promise<void> {
  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: ADMIN_DB,
  });
  await client.connect();
  try {
    const exists = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [DB_NAME]
    );
    if (exists.rows.length === 0) {
      // CREATE DATABASE cannot run in a transaction and has no IF NOT EXISTS.
      await client.query(`CREATE DATABASE "${DB_NAME}"`);
      console.log(`✅ Created database "${DB_NAME}"`);
    } else {
      console.log(`ℹ️  Database "${DB_NAME}" already exists`);
    }
  } finally {
    await client.end();
  }
}

async function applySchema(): Promise<void> {
  const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`✅ Applied schema to "${DB_NAME}"`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  try {
    await ensureDatabase();
    await applySchema();
    console.log('✅ Migration complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

void main();
