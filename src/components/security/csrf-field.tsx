import { CSRF_FIELD_NAME } from '@/lib/auth/constants';
import { getCsrfToken } from '@/lib/auth/csrf';

/**
 * Hidden CSRF field for Server Action forms.
 *
 * A Server Component, so the token is read on the server and never round-trips
 * through client state. Every form that mutates must include this -- the
 * actions reject a submission without it.
 */
export async function CsrfField() {
  const token = await getCsrfToken();
  return <input type="hidden" name={CSRF_FIELD_NAME} value={token} />;
}
