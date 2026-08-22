import { z } from 'zod';

import { AUDIT_ACTIONS, USER_ROLES } from '@/models/types';

import {
  emailSchema,
  limitSchema,
  objectIdString,
  pageSchema,
  singleLineText,
  stockSchema,
} from './common';

/**
 * Admin operation schemas.
 *
 * These validate the *shape* of an admin request. They do not, and cannot,
 * establish that the caller is an admin -- that is `requireAdmin()`, run before
 * parsing, against the session's database record. A schema named `admin.ts`
 * grants nothing.
 *
 * Two business rules deliberately live in the service rather than here, because
 * both need to read current state:
 *   - an admin may not change their own role (self-lockout, and a compromised
 *     admin session escalating quietly)
 *   - the last remaining admin may not be demoted or disabled
 */

export const updateUserRoleSchema = z.strictObject({
  userId: objectIdString,
  role: z.enum(USER_ROLES),
});

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;

export const setUserDisabledSchema = z.strictObject({
  userId: objectIdString,
  isDisabled: z.boolean(),
  reason: singleLineText(0, 200, 'Reason').optional().or(z.literal('')),
});

export const adminUserListQuerySchema = z.object({
  q: emailSchema.optional().catch(undefined),
  role: z.enum(USER_ROLES).optional().catch(undefined),
  disabled: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === 'true' || value === '1'),
  page: pageSchema,
  limit: limitSchema,
});

/**
 * Direct stock adjustment.
 *
 * `reason` is mandatory and ends up in the audit log. Inventory is money, and
 * an unexplained adjustment is indistinguishable from theft after the fact.
 */
export const adjustInventorySchema = z.strictObject({
  productId: objectIdString,
  stock: stockSchema,
  reason: singleLineText(3, 200, 'Reason'),
});

export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;

export const auditLogQuerySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional().catch(undefined),
  actorId: objectIdString.optional().catch(undefined),
  page: pageSchema,
  limit: limitSchema,
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

/** Dashboard time window. Bounded so a report cannot scan all history. */
export const dashboardRangeSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).catch(30).default(30),
});
