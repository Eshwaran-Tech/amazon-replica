import { MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import { ObjectId } from 'mongodb';
import Link from 'next/link';

import { deleteAddressAction, setDefaultAddressAction } from '@/actions/account';
import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { requirePageUser } from '@/lib/auth/guards';
import { listAddresses, MAX_ADDRESSES } from '@/services/account';

import { AddressForm } from './address-form';

export const metadata: Metadata = {
  title: 'Your addresses',
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Address book.
 *
 * The list, the edit target, and every mutation are resolved against the
 * session's own user document. The `edit` query parameter is matched against
 * the caller's addresses -- an id from someone else's book matches nothing and
 * simply renders the list.
 */
export default async function AddressesPage({ searchParams }: PageProps) {
  const session = await requirePageUser('/account/addresses');
  const params = await searchParams;

  const addresses = await listAddresses(new ObjectId(session.user.id));

  const editId = typeof params.edit === 'string' ? params.edit : null;
  const editing = editId ? (addresses.find((address) => address.id === editId) ?? null) : null;
  const adding = params.add === '1';
  const saved = params.saved === '1';

  return (
    <Container size="default" className="py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/account" className="hover:text-link hover:underline">
          Your Account
        </Link>{' '}
        / <span className="text-ink">Addresses</span>
      </nav>

      <h1 className="mt-1 text-xl font-bold sm:text-2xl">Your Addresses</h1>

      {saved && (
        <div className="mt-3">
          <Alert tone="success">Your address has been saved.</Alert>
        </div>
      )}

      {/* ------------------------------------------------- add / edit form */}
      {(adding || editing) && (
        <div className="border-hairline bg-surface mt-4 max-w-2xl rounded-2xl border p-4 sm:p-5">
          <h2 className="text-base font-bold">{editing ? 'Edit address' : 'Add a new address'}</h2>
          <div className="mt-3">
            <AddressForm key={editing?.id ?? 'new'} address={editing} csrfField={<CsrfField />} />
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- the book */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!adding && !editing && addresses.length < MAX_ADDRESSES && (
          <Link
            href="/account/addresses?add=1"
            className="border-hairline hover:bg-surface-muted flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-4 text-center"
          >
            <MapPin className="text-ink-subtle h-8 w-8" aria-hidden="true" />
            <span className="text-sm font-semibold">Add address</span>
          </Link>
        )}

        {addresses.map((address) => (
          <div
            key={address.id}
            className="border-hairline bg-surface flex flex-col rounded-2xl border p-4"
          >
            {address.isDefault && (
              <span className="border-hairline text-ink-muted mb-2 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase">
                Default
              </span>
            )}
            <p className="text-sm">
              <span className="font-semibold">{address.fullName}</span>{' '}
              <span className="text-ink-subtle">({address.type.toLowerCase()})</span>
              <br />
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ''}
              <br />
              {address.city}, {address.state} {address.postalCode}
              <br />
              <span className="text-ink-muted">Phone: {address.phone}</span>
            </p>

            <div className="border-hairline mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2.5 text-sm">
              <Link
                href={`/account/addresses?edit=${address.id}`}
                className="text-link min-h-9 content-center hover:underline"
              >
                Edit
              </Link>

              <form action={deleteAddressAction}>
                <CsrfField />
                <input type="hidden" name="addressId" value={address.id} />
                <SubmitButton variant="ghost" size="sm" pendingLabel="Removing...">
                  Remove
                </SubmitButton>
              </form>

              {!address.isDefault && (
                <form action={setDefaultAddressAction} className="ml-auto">
                  <CsrfField />
                  <input type="hidden" name="addressId" value={address.id} />
                  <SubmitButton variant="ghost" size="sm" pendingLabel="Saving...">
                    Set as default
                  </SubmitButton>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>

      {addresses.length === 0 && !adding && (
        <p className="text-ink-muted mt-4 text-sm">
          No saved addresses yet. Your first address becomes the default automatically.
        </p>
      )}
    </Container>
  );
}
