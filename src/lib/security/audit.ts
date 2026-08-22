import { ObjectId } from 'mongodb';

import { auditLogsCollection } from '@/lib/db/collections';
import { logError, logSecurityEvent } from '@/lib/security/logger';
import type { AuditAction, UserRole } from '@/models/types';

import '@/lib/server-guard';

/**
 * Append-only audit trail for security-sensitive actions.
 *
 * Distinct from `logger.ts`, which writes to stdout for operational alerting.
 * This is the durable, queryable record an admin reads in the UI and an
 * investigator reads after an incident: who changed which price, who promoted
 * whom, when a refund was issued.
 *
 * Two rules:
 *
 *  1. **Never store a secret.** Metadata is filtered through an allow-list of
 *     value types and a deny-list of key names before it is written. An audit
 *     log containing a password reset token is a liability, not a control.
 *
 *  2. **Never fail the operation.** A write here must not roll back the action
 *     it describes -- refusing an admin's legitimate price change because the
 *     log write timed out is worse than the missing line. Failures are reported
 *     to stdout, where alerting can catch a sustained outage.
 */

const SENSITIVE_KEY_PATTERN =
  /(pass|secret|token|cookie|authorization|credential|apikey|api_key|session|cvv|cardnumber|card_number|hash)/i;

const MAX_METADATA_KEYS = 25;
const MAX_STRING_LENGTH = 300;

/**
 * Flattens metadata to scalars only.
 *
 * Nested objects are dropped rather than recursed: an audit entry should record
 * *what changed*, and accepting arbitrary nested input is how an entire user
 * document (hash included) ends up in the log by accident.
 */
function sanitiseMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!metadata) return null;

  const output: Record<string, unknown> = {};
  let count = 0;

  for (const [key, value] of Object.entries(metadata)) {
    if (count >= MAX_METADATA_KEYS) break;
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (key.startsWith('$') || key.includes('.')) continue; // never a query operator

    if (typeof value === 'string') {
      output[key] = value.slice(0, MAX_STRING_LENGTH);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      output[key] = value;
    } else if (value instanceof ObjectId) {
      output[key] = value.toHexString();
    } else if (value instanceof Date) {
      output[key] = value.toISOString();
    } else if (value === null) {
      output[key] = null;
    } else {
      continue; // arrays, nested objects, functions: dropped
    }

    count += 1;
  }

  return Object.keys(output).length > 0 ? output : null;
}

export interface AuditEntry {
  action: AuditAction;
  actorId?: ObjectId | string | null;
  actorRole?: UserRole | null;
  /** e.g. 'product', 'order', 'user'. */
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

function toObjectId(value: ObjectId | string | null | undefined): ObjectId | null {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const collection = await auditLogsCollection();

    await collection.insertOne({
      _id: new ObjectId(),
      action: entry.action,
      actorId: toObjectId(entry.actorId),
      actorRole: entry.actorRole ?? null,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ? entry.targetId.slice(0, 100) : null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ? entry.userAgent.slice(0, 256) : null,
      metadata: sanitiseMetadata(entry.metadata),
      createdAt: new Date(),
    });
  } catch (error) {
    // Deliberately swallowed -- see the header comment. Surfaced to stdout so a
    // sustained failure is still visible to alerting.
    logError('Audit log write failed', error, { action: entry.action });
  }
}

/**
 * Records an entry *and* emits a stdout security event.
 *
 * Used for the subset worth alerting on in real time -- repeated login
 * failures, role changes, refunds -- where waiting for someone to open the
 * audit screen is too slow.
 */
export async function recordAuditAndAlert(
  entry: AuditEntry,
  severity: 'info' | 'warn' | 'error' = 'warn',
): Promise<void> {
  logSecurityEvent({
    type: entry.action,
    severity,
    userId: entry.actorId ? String(entry.actorId) : undefined,
    ip: entry.ip ?? undefined,
    detail: {
      targetType: entry.targetType,
      targetId: entry.targetId,
      ...entry.metadata,
    },
  });

  await recordAudit(entry);
}
