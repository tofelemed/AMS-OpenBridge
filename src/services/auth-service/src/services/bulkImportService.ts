/**
 * Bulk Import Service - CSV validation and batch user import
 */

import pool from '../config/database';
import logger from '../config/logger';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10');

// ============================================================================
// TYPES
// ============================================================================

export interface BulkImportRow {
    row_number: number;
    data: Record<string, any>;
    status: 'valid' | 'error' | 'warning' | 'duplicate';
    errors: string[];
    warnings: string[];
}

export interface BulkValidationResult {
    totalRows: number;
    validRows: number;
    errorRows: number;
    warningRows: number;
    duplicateRows: number;
    rows: BulkImportRow[];
}

export interface BulkImportResult {
    totalProcessed: number;
    created: number;
    updated: number;
    skipped: number;
    errors: { row: number; error: string }[];
}

// ============================================================================
// TEMPLATE
// ============================================================================

export const TEMPLATE_HEADERS = [
    'username',
    'email',
    'full_name',
    'password',
    'role',
    'is_active',
];

export const REQUIRED_FIELDS = [
    'username',
    'email',
    'password',
    'role',
];

const VALID_ROLES = [
  'Admin',
  'Engineer',
  'Operator',
  'Viewer',
  'admin',
  'engineer',
  'operator',
  'viewer',
];

/**
 * Generate CSV template content
 */
export const generateTemplate = (): string => {
    const header = TEMPLATE_HEADERS.join(',');
    const exampleRow = [
        'john_doe',           // username
        'john.doe@example.com', // email
        'John Doe',           // full_name
        'SecurePass123!',     // password
        'Engineer',           // role
        'true',               // is_active
    ].join(',');
    return `${header}\n${exampleRow}\n`;
};

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check for duplicate usernames in database
 */
const checkDuplicateUsernames = async (usernames: string[]): Promise<string[]> => {
    if (usernames.length === 0) return [];
    
    const placeholders = usernames.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(
        `SELECT username FROM users WHERE username IN (${placeholders})`,
        usernames
    );
    return result.rows.map((r: any) => r.username);
};

/**
 * Check for duplicate emails in database
 */
const checkDuplicateEmails = async (emails: string[]): Promise<string[]> => {
    if (emails.length === 0) return [];
    
    const placeholders = emails.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(
        `SELECT email FROM users WHERE email IN (${placeholders})`,
        emails
    );
    return result.rows.map((r: any) => r.email);
};

/**
 * Validate a batch of rows for bulk import
 */
export const validateBulkImport = async (rows: Record<string, any>[]): Promise<BulkValidationResult> => {
    const results: BulkImportRow[] = [];
    let validCount = 0;
    let errorCount = 0;
    let warningCount = 0;
    let duplicateCount = 0;

    // Collect all usernames and emails for bulk duplicate check
    const usernames = rows
        .map(r => r.username)
        .filter((u): u is string => !!u && typeof u === 'string' && u.trim() !== '');
    
    const emails = rows
        .map(r => r.email)
        .filter((e): e is string => !!e && typeof e === 'string' && e.trim() !== '');

    // Check DB duplicates
    const existingUsernames = await checkDuplicateUsernames(usernames);
    const existingEmails = await checkDuplicateEmails(emails);
    const existingUsernameSet = new Set(existingUsernames);
    const existingEmailSet = new Set(existingEmails);

    // Check in-file duplicates
    const inFileUsernameCounts = new Map<string, number>();
    usernames.forEach(u => {
        inFileUsernameCounts.set(u, (inFileUsernameCounts.get(u) || 0) + 1);
    });

    const inFileEmailCounts = new Map<string, number>();
    emails.forEach(e => {
        inFileEmailCounts.set(e, (inFileEmailCounts.get(e) || 0) + 1);
    });

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required field validation
        for (const field of REQUIRED_FIELDS) {
            if (!row[field] || (typeof row[field] === 'string' && row[field].trim() === '')) {
                errors.push(`${field} is required`);
            }
        }

        // Username validation
        if (row.username) {
            const username = String(row.username).trim();
            if (username.length < 3 || username.length > 100) {
                errors.push('username must be between 3 and 100 characters');
            }
            if (!/^[a-zA-Z0-9_]+$/.test(username)) {
                errors.push('username can only contain letters, numbers, and underscores');
            }
        }

        // Email validation
        if (row.email) {
            const email = String(row.email).trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                errors.push('email has invalid format');
            }
        }

        // Password validation
        if (row.password) {
            const password = String(row.password);
            if (password.length < 8) {
                errors.push('password must be at least 8 characters long');
            } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
                errors.push('password must contain at least one uppercase letter, one lowercase letter, and one number');
            }
        }

        // Role validation
        if (row.role) {
            const role = String(row.role).trim();
            if (!VALID_ROLES.includes(role)) {
                warnings.push(`role '${role}' is non-standard. Expected: Admin, Engineer, Operator, or Viewer`);
            }
        }

        // is_active validation
        if (row.is_active !== undefined && row.is_active !== '') {
            const isActive = String(row.is_active).toLowerCase();
            if (!['true', 'false', '1', '0', 'yes', 'no'].includes(isActive)) {
                warnings.push(`is_active '${row.is_active}' is non-standard. Expected: true or false`);
            }
        }

        // Duplicate detection
        let isDuplicate = false;
        if (row.username && existingUsernameSet.has(String(row.username).trim())) {
            warnings.push(`Duplicate: username '${row.username}' already exists in database`);
            isDuplicate = true;
        }
        if (row.username && (inFileUsernameCounts.get(String(row.username).trim()) || 0) > 1) {
            warnings.push(`Duplicate: username '${row.username}' appears multiple times in this file`);
            isDuplicate = true;
        }
        if (row.email && existingEmailSet.has(String(row.email).trim())) {
            warnings.push(`Duplicate: email '${row.email}' already exists in database`);
            isDuplicate = true;
        }
        if (row.email && (inFileEmailCounts.get(String(row.email).trim()) || 0) > 1) {
            warnings.push(`Duplicate: email '${row.email}' appears multiple times in this file`);
            isDuplicate = true;
        }

        // Determine row status
        let status: BulkImportRow['status'] = 'valid';
        if (errors.length > 0) {
            status = 'error';
            errorCount++;
        } else if (isDuplicate) {
            status = 'duplicate';
            duplicateCount++;
        } else if (warnings.length > 0) {
            status = 'warning';
            warningCount++;
        } else {
            validCount++;
        }

        results.push({
            row_number: i + 1,
            data: row,
            status,
            errors,
            warnings,
        });
    }

    return {
        totalRows: rows.length,
        validRows: validCount,
        errorRows: errorCount,
        warningRows: warningCount,
        duplicateRows: duplicateCount,
        rows: results,
    };
};

// ============================================================================
// EXECUTION
// ============================================================================

/**
 * Execute bulk import - batch insert/update users
 */
export const executeBulkImport = async (
    rows: Record<string, any>[],
    options: { skipErrors?: boolean; overwriteDuplicates?: boolean } = {}
): Promise<BulkImportResult> => {
    const { skipErrors = true, overwriteDuplicates = false } = options;

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: { row: number; error: string }[] = [];

    // Process in a single transaction on one dedicated client (a pooled BEGIN/COMMIT
    // via pool.query would run on different connections and leak idle-in-transaction ones).
    const client = await pool.connect();
    await client.query('BEGIN');

    try {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            // Per-row SAVEPOINT so a single row's DB error can be skipped without
            // aborting the whole transaction (required for skipErrors).
            await client.query('SAVEPOINT row_sp');
            try {
                const username = String(row.username).trim();
                const email = String(row.email).trim();
                const password = String(row.password);
                const fullName = row.full_name ? String(row.full_name).trim() : null;
                const role = String(row.role).trim();
                const isActive = row.is_active !== undefined && row.is_active !== ''
                    ? ['true', '1', 'yes'].includes(String(row.is_active).toLowerCase())
                    : true;

                // Check if user with this username or email already exists
                const existingResult = await client.query(
                    `SELECT user_id, username, email FROM users WHERE username = $1 OR email = $2`,
                    [username, email]
                );

                if (existingResult.rows.length > 0) {
                    const existing = existingResult.rows[0];
                    if (overwriteDuplicates) {
                        // Update existing user (but don't update password unless provided)
                        const updateFields: string[] = [];
                        const updateValues: unknown[] = [];
                        let paramIdx = 1;

                        if (email !== existing.email) {
                            updateFields.push(`email = $${paramIdx++}`);
                            updateValues.push(email);
                        }
                        if (fullName !== null) {
                            updateFields.push(`full_name = $${paramIdx++}`);
                            updateValues.push(fullName);
                        }
                        if (role) {
                            updateFields.push(`role = $${paramIdx++}`);
                            updateValues.push(role);
                        }
                        updateFields.push(`is_active = $${paramIdx++}`);
                        updateValues.push(isActive);

                        if (updateFields.length > 0) {
                            updateFields.push(`updated_at = NOW()`);
                            updateValues.push(existing.user_id);
                            await client.query(
                                `UPDATE users SET ${updateFields.join(', ')} WHERE user_id = $${paramIdx}`,
                                updateValues
                            );
                        }
                        updated++;
                    } else {
                        skipped++;
                    }
                } else {
                    // Create new user
                    const userId = uuidv4();
                    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

                    await client.query(
                        `INSERT INTO users (user_id, username, email, password_hash, full_name, role, is_active)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [userId, username, email, passwordHash, fullName, role, isActive]
                    );
                    created++;
                }

                await client.query('RELEASE SAVEPOINT row_sp');
            } catch (err: any) {
                await client.query('ROLLBACK TO SAVEPOINT row_sp');
                if (skipErrors) {
                    skipped++;
                    errors.push({ row: i + 1, error: err.message });
                    logger.warn('Bulk import row error', { row: i + 1, error: err.message });
                } else {
                    throw err; // Rollback entire transaction
                }
            }
        }

        await client.query('COMMIT');
    } catch (err: any) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    logger.info('Bulk import completed', { created, updated, skipped, errorCount: errors.length });

    return {
        totalProcessed: rows.length,
        created,
        updated,
        skipped,
        errors,
    };
};
