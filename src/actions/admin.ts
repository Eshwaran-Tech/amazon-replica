'use server';

import { ObjectId } from 'mongodb';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { CSRF_FIELD_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { readCsrfCookie } from '@/lib/auth/cookies';
import { getRequestContext, getSession } from '@/lib/auth/guards';
import type { FormState } from '@/lib/forms/state';
import { csrfSubject, verifyCsrf } from '@/lib/security/csrf';
import { logSecurityEvent } from '@/lib/security/logger';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { fieldErrors } from '@/lib/validations/common';
import { adjustInventorySchema, setUserDisabledSchema, updateUserRoleSchema } from '@/lib/validations/admin';
import { categoryCreateSchema, categoryDeleteSchema, categoryUpdateSchema } from '@/lib/validations/category';
import { updateOrderStatusSchema } from '@/lib/validations/order';
import { productCreateSchema, productDeactivateSchema, productUpdateSchema } from '@/lib/validations/product';
import {
  adjustInventory,
  adminUpdateOrderStatus,
  createCategory,
  createProduct,
  deleteCategory,
  setProductActive,
  setUserDisabled,
  setUserRole,
  updateCategory,
  updateProduct,
  type AdminActor,
} from '@/services/admin';

/**
 * Admin Server Actions.
 *
 * Every action independently re-establishes that the caller is an admin from
 * the database-backed session -- the `/admin` URL prefix, the proxy, and the
 * layout guard are conveniences, not the control. A non-admin reaching one of
 * these endpoints directly gets the same generic failure as a signed-out
 * caller, plus a security-log entry.
 */

async function verifyActionCsrf(formData: FormData): Promise<boolean> {
  const submitted = formData.get(CSRF_FIELD_NAME);
  const cookieToken = await readCsrfCookie();
  const store = await cookies();
  const subject = csrfSubject(store.get(SESSION_COOKIE_NAME)?.value ?? null);

  const result = verifyCsrf(cookieToken, typeof submitted === 'string' ? submitted : null, subject);
  if (!result.ok) {
    logSecurityEvent({
      type: 'csrf.rejected',
      severity: 'warn',
      detail: { surface: 'admin-action', reason: result.reason },
    });
  }
  return result.ok;
}

const CSRF_FAILURE: FormState = {
  ok: false,
  message: 'Your session expired. Please refresh the page and try again.',
};

const NOT_ADMIN: FormState = { ok: false, message: 'We could not find that.' };

async function requireAdminActor(): Promise<AdminActor | FormState> {
  const session = await getSession();
  const context = await getRequestContext();

  if (!session || session.user.role !== 'ADMIN') {
    logSecurityEvent({
      type: 'authz.denied',
      severity: 'warn',
      userId: session?.user.id,
      ip: context.ip,
      detail: { area: 'admin-action', role: session?.user.role ?? 'anonymous' },
    });
    return NOT_ADMIN;
  }

  const limit = await checkRateLimit('admin:mutation:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many changes in a short time. Please slow down.' };
  }

  return { id: new ObjectId(session.user.id), ip: context.ip };
}

function isFormState(value: AdminActor | FormState): value is FormState {
  return 'ok' in value;
}

// ----------------------------------------------------------- form decoding

/** One entry per non-empty line. */
function lines(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** "Label: value" per line -> specification objects. */
function specificationLines(value: FormDataEntryValue | null): Array<{ label: string; value: string }> {
  return lines(value).flatMap((line) => {
    const separator = line.indexOf(':');
    if (separator === -1) return [{ label: line, value: '' }]; // fails Zod loudly
    return [
      {
        label: line.slice(0, separator).trim(),
        value: line.slice(separator + 1).trim(),
      },
    ];
  });
}

function readProductFields(formData: FormData) {
  const images = lines(formData.get('images'));
  const thumbnail = formData.get('thumbnail');
  return {
    name: formData.get('name'),
    description: formData.get('description'),
    brand: formData.get('brand'),
    category: formData.get('category'),
    subcategory: formData.get('subcategory') || null,
    price: formData.get('price'),
    discountPrice: formData.get('discountPrice') || null,
    stock: formData.get('stock'),
    images,
    // An empty thumbnail field means "use the first image".
    thumbnail: typeof thumbnail === 'string' && thumbnail.trim() ? thumbnail.trim() : images[0],
    features: lines(formData.get('features')),
    specifications: specificationLines(formData.get('specifications')),
    isFeatured: formData.get('isFeatured') === 'on',
    isPrime: formData.get('isPrime') === 'on',
    isActive: formData.get('isActive') === 'on',
  };
}

// ----------------------------------------------------------------- products

export async function createProductAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;
  const actor = await requireAdminActor();
  if (isFormState(actor)) return actor;

  const parsed = productCreateSchema.safeParse(readProductFields(formData));
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error), message: 'Please check the highlighted fields.' };
  }

  const result = await createProduct(parsed.data, actor);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/', 'layout');
  redirect(`/admin/products/${result.value.productId}?created=1`);
}

export async function updateProductAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;
  const actor = await requireAdminActor();
  if (isFormState(actor)) return actor;

  const parsed = productUpdateSchema.safeParse({
    productId: formData.get('productId'),
    ...readProductFields(formData),
  });
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error), message: 'Please check the highlighted fields.' };
  }

  const result = await updateProduct(parsed.data, actor);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/', 'layout');
  return { ok: true, message: 'Product saved.' };
}

export async function setProductActiveAction(formData: FormData): Promise<void> {
  if (!(await verifyActionCsrf(formData))) redirect('/admin/products');
  const actor = await requireAdminActor();
  if (isFormState(actor)) redirect('/admin/products');

  const parsed = productDeactivateSchema.safeParse({
    productId: formData.get('productId'),
    isActive: formData.get('isActive') === 'true',
  });
  if (parsed.success) {
    await setProductActive(parsed.data.productId, parsed.data.isActive, actor);
    revalidatePath('/', 'layout');
  }
  redirect('/admin/products');
}

export async function adjustInventoryAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;
  const actor = await requireAdminActor();
  if (isFormState(actor)) return actor;

  const parsed = adjustInventorySchema.safeParse({
    productId: formData.get('productId'),
    stock: formData.get('stock'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error), message: 'Please check the highlighted fields.' };
  }

  const result = await adjustInventory(parsed.data, actor);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/', 'layout');
  return { ok: true, message: 'Stock updated and recorded in the audit log.' };
}

// --------------------------------------------------------------- categories

function readCategoryFields(formData: FormData) {
  return {
    name: formData.get('name'),
    slug: formData.get('slug'),
    description: formData.get('description') || null,
    image: formData.get('image') || null,
    parentSlug: formData.get('parentSlug') || null,
    displayOrder: formData.get('displayOrder') || 0,
    isActive: formData.get('isActive') === 'on',
  };
}

export async function createCategoryAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;
  const actor = await requireAdminActor();
  if (isFormState(actor)) return actor;

  const parsed = categoryCreateSchema.safeParse(readCategoryFields(formData));
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error), message: 'Please check the highlighted fields.' };
  }

  const result = await createCategory(parsed.data, actor);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/', 'layout');
  redirect('/admin/categories?saved=1');
}

export async function updateCategoryAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;
  const actor = await requireAdminActor();
  if (isFormState(actor)) return actor;

  const parsed = categoryUpdateSchema.safeParse({
    categoryId: formData.get('categoryId'),
    ...readCategoryFields(formData),
  });
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error), message: 'Please check the highlighted fields.' };
  }

  const result = await updateCategory(parsed.data, actor);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/', 'layout');
  redirect('/admin/categories?saved=1');
}

export async function deleteCategoryAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;
  const actor = await requireAdminActor();
  if (isFormState(actor)) return actor;

  const parsed = categoryDeleteSchema.safeParse({ categoryId: formData.get('categoryId') });
  if (!parsed.success) return { ok: false, message: 'We could not find that category.' };

  const result = await deleteCategory(parsed.data.categoryId, actor);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/', 'layout');
  redirect('/admin/categories');
}

// ------------------------------------------------------------------- orders

export async function updateOrderStatusAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;
  const actor = await requireAdminActor();
  if (isFormState(actor)) return actor;

  const parsed = updateOrderStatusSchema.safeParse({
    orderId: formData.get('orderId'),
    status: formData.get('status'),
    note: formData.get('note') || '',
  });
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error), message: 'Please check the form.' };
  }

  const result = await adminUpdateOrderStatus(
    parsed.data.orderId,
    parsed.data.status,
    parsed.data.note ?? '',
    actor,
  );
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/', 'layout');
  return { ok: true, message: `Order moved to ${parsed.data.status}.` };
}

// -------------------------------------------------------------------- users

export async function setUserRoleAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;
  const actor = await requireAdminActor();
  if (isFormState(actor)) return actor;

  const parsed = updateUserRoleSchema.safeParse({
    userId: formData.get('userId'),
    role: formData.get('role'),
  });
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };

  const result = await setUserRole(parsed.data.userId, parsed.data.role, actor);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/admin/users');
  return { ok: true, message: 'Role updated.' };
}

export async function setUserDisabledAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;
  const actor = await requireAdminActor();
  if (isFormState(actor)) return actor;

  const parsed = setUserDisabledSchema.safeParse({
    userId: formData.get('userId'),
    isDisabled: formData.get('isDisabled') === 'true',
    reason: formData.get('reason') || '',
  });
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };

  const result = await setUserDisabled(
    parsed.data.userId,
    parsed.data.isDisabled,
    parsed.data.reason ?? '',
    actor,
  );
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/admin/users');
  return {
    ok: true,
    message: parsed.data.isDisabled
      ? 'Account disabled. Their sessions end on their next request.'
      : 'Account re-enabled.',
  };
}
