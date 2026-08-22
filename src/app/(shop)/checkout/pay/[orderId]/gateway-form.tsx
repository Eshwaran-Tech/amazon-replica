'use client';

import { CreditCard, XCircle } from 'lucide-react';
import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { payWithMockCardAction, simulateGatewayAction } from '@/actions/checkout';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { TextField } from '@/components/ui/text-field';
import { emptyFormState } from '@/lib/forms/state';
import type { PaymentMethod } from '@/models/types';

interface GatewayFormProps {
  orderId: string;
  method: PaymentMethod;
  totalFormatted: string;
  csrfField: ReactNode;
}

/**
 * The development gateway UI.
 *
 * For CARD, a test-card form: the number decides the simulated outcome on the
 * server. For UPI/netbanking, the approve/fail pair every bank sandbox has.
 * In both cases the *outcome is recorded server-side* by the same code path a
 * verified webhook uses; these controls only initiate the simulation.
 */
export function GatewayForm({ orderId, method, totalFormatted, csrfField }: GatewayFormProps) {
  const [cardState, cardAction] = useActionState(payWithMockCardAction, emptyFormState);
  const [simState, simAction] = useActionState(simulateGatewayAction, emptyFormState);

  if (method === 'CARD') {
    return (
      <form action={cardAction} className="space-y-4" noValidate>
        {csrfField}
        <input type="hidden" name="orderId" value={orderId} />

        {cardState.message && !cardState.ok && <Alert tone="error">{cardState.message}</Alert>}

        <Alert tone="info">
          Test gateway -- no real money moves. Cards: 4242 4242 4242 4242 succeeds, 4000 0000 0000
          0002 is declined, 4000 0000 0000 9995 fails with insufficient funds.
        </Alert>

        <TextField
          id="nameOnCard"
          name="nameOnCard"
          label="Name on card"
          autoComplete="cc-name"
          required
          error={cardState.fields?.nameOnCard}
        />
        <TextField
          id="cardNumber"
          name="cardNumber"
          label="Card number"
          autoComplete="cc-number"
          inputMode="numeric"
          placeholder="4242 4242 4242 4242"
          required
          error={cardState.fields?.cardNumber}
        />

        <div className="grid grid-cols-3 gap-3">
          <TextField
            id="expiryMonth"
            name="expiryMonth"
            label="Month"
            autoComplete="cc-exp-month"
            inputMode="numeric"
            placeholder="12"
            required
            error={cardState.fields?.expiryMonth}
          />
          <TextField
            id="expiryYear"
            name="expiryYear"
            label="Year"
            autoComplete="cc-exp-year"
            inputMode="numeric"
            placeholder="2030"
            required
            error={cardState.fields?.expiryYear}
          />
          <TextField
            id="cvv"
            name="cvv"
            label="CVV"
            autoComplete="cc-csc"
            inputMode="numeric"
            placeholder="123"
            required
            error={cardState.fields?.cvv}
          />
        </div>

        <SubmitButton fullWidth size="lg" pendingLabel="Contacting the (simulated) bank...">
          <CreditCard className="h-4 w-4" aria-hidden="true" />
          Pay {totalFormatted}
        </SubmitButton>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {simState.message && !simState.ok && <Alert tone="error">{simState.message}</Alert>}

      <Alert tone="info">
        Simulated {method === 'UPI' ? 'UPI' : 'net banking'} sandbox -- choose an outcome exactly as
        you would on a bank&apos;s test page. No real money moves.
      </Alert>

      <form action={simAction} className="space-y-3">
        {csrfField}
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="outcome" value="success" />

        <SubmitButton fullWidth size="lg" pendingLabel="Completing payment...">
          Approve payment of {totalFormatted}
        </SubmitButton>
      </form>

      <form action={simAction}>
        {csrfField}
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="outcome" value="failure" />
        <SubmitButton variant="secondary" fullWidth pendingLabel="Failing payment...">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          Simulate a failed payment
        </SubmitButton>
      </form>
    </div>
  );
}
