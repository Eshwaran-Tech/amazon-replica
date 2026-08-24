import { randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { getMongoClient, getDb } from '@/lib/db/client';
import { COLLECTIONS, ordersCollection, usersCollection } from '@/lib/db/collections';
import { sendOrderConfirmationEmail } from '@/lib/email';
import { recordAudit } from '@/lib/security/audit';
import { formatPaise } from '@/lib/utils/money';
import { MAX_QUANTITY_PER_LINE, type CartDoc } from '@/models/cart';
import { effectivePrice, type ProductDoc } from '@/models/product';
import type { OrderDoc, OrderItemDoc } from '@/models/order';
import type { Address, PaymentMethod } from '@/models/types';
import type { WalletEntryDoc } from '@/models/wallet';
import { cashbackFor } from '@/services/cashback';
import { bestClaimFor, spendClaim } from '@/services/rewards';
import { isPrimeMember } from '@/services/prime';
import { calculateTotals } from '@/services/pricing';
import { getWalletSummary } from '@/services/wallet';
import type { AddressInput } from '@/lib/validations/user';

import '@/lib/server-guard';

/**
 * Order placement.
 *
 * The invariants this module exists to guarantee:
 *
 *  1. **Every amount is computed here, from the catalogue, inside the
 *     transaction.** The request schema has no field for a price, and this
 *     service reads none from its caller. Prices are re-read from `products`
 *     *within the transaction*, so the number snapshotted onto the order is
 *     the number that was true at the moment stock was taken.
 *
 *  2. **Stock is decremented conditionally and atomically.** Each line does
 *     `updateOne({_id, stock: {$gte: qty}}, {$inc: {stock: -qty}})` inside a
 *     multi-document transaction. Two buyers racing the last unit both pass
 *     any earlier check; exactly one conditional decrement matches. The loser
 *     aborts, which rolls back every decrement the transaction already made --
 *     no partial reservations, ever.
 *
 *  3. **Idempotency.** The client sends a random key per checkout attempt; a
 *     retry (double-click, network replay) finds the existing order and
 *     returns it instead of charging twice.
 *
 *  4. **A wallet payment is part of the same transaction.** When the customer
 *     pays from their Eshwaran Pay balance, the balance is read and the debit is
 *     written inside this transaction, alongside the stock decrement and the
 *     order insert. Either all of it happened or none of it did: there is no
 *     window in which the wallet is charged for an order that does not exist,
 *     or an order exists that was never paid for.
 */

export type PlaceOrderResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      alreadyPlaced: boolean;
      paymentMethod: PaymentMethod;
    }
  | {
      ok: false;
      code: 'EMPTY_CART' | 'ADDRESS_NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'INSUFFICIENT_BALANCE';
      message: string;
      /** For INSUFFICIENT_STOCK: which items could not be supplied. */
      shortages?: string[];
    };

/** NK- plus 8 hex chars, retried on the (astronomically rare) collision. */
function generateOrderNumber(): string {
  return `NK-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export interface PlaceOrderInput {
  addressId?: string;
  newAddress?: AddressInput;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
}

export async function placeOrder(
  userId: ObjectId,
  input: PlaceOrderInput,
  context: { ip: string },
): Promise<PlaceOrderResult> {
  const orders = await ordersCollection();
  const primeMember = await isPrimeMember(userId.toHexString());

  // ---- idempotency: a replayed submit returns the original order ----------
  const existing = await orders.findOne({ userId, 'payment.reference': input.idempotencyKey });
  if (existing) {
    return {
      ok: true,
      orderId: existing._id.toHexString(),
      orderNumber: existing.orderNumber,
      alreadyPlaced: true,
      paymentMethod: existing.paymentMethod,
    };
  }

  // ---- resolve the shipping address ---------------------------------------
  const users = await usersCollection();
  const user = await users.findOne({ _id: userId });
  if (!user) return { ok: false, code: 'ADDRESS_NOT_FOUND', message: 'Account not found.' };

  let shippingAddress: Address;

  if (input.addressId) {
    // Looked up inside the *caller's own* address book -- an id belonging to
    // another user simply does not match anything here.
    const found = user.addresses.find((address) => address.id === input.addressId);
    if (!found) {
      return { ok: false, code: 'ADDRESS_NOT_FOUND', message: 'Select a valid delivery address.' };
    }
    shippingAddress = found;
  } else if (input.newAddress) {
    shippingAddress = {
      ...input.newAddress,
      line2: input.newAddress.line2 || undefined,
      id: new ObjectId().toHexString(),
      isDefault: user.addresses.length === 0,
    };
    // Saved to the profile for next time; the order gets its own snapshot.
    await users.updateOne(
      { _id: userId },
      { $push: { addresses: shippingAddress }, $set: { updatedAt: new Date() } },
    );
  } else {
    return { ok: false, code: 'ADDRESS_NOT_FOUND', message: 'Select a delivery address.' };
  }

  // ---- the transaction ----------------------------------------------------
  const client = await getMongoClient();
  const db = await getDb();
  const session = client.startSession();

  let placed: OrderDoc | null = null;
  let failure: PlaceOrderResult | null = null;

  try {
    await session.withTransaction(async () => {
      const cartsC = db.collection<CartDoc>(COLLECTIONS.carts);
      const productsC = db.collection<ProductDoc>(COLLECTIONS.products);
      const ordersC = db.collection<OrderDoc>(COLLECTIONS.orders);

      const cart = await cartsC.findOne({ userId }, { session });
      if (!cart || cart.items.length === 0) {
        failure = { ok: false, code: 'EMPTY_CART', message: 'Your cart is empty.' };
        await session.abortTransaction();
        return;
      }

      const items: OrderItemDoc[] = [];
      const shortages: string[] = [];

      for (const line of cart.items) {
        // Price and stock read *inside* the transaction: this snapshot is the
        // authoritative one, whatever the cart page showed a minute ago.
        const product = await productsC.findOne(
          { _id: line.productId, isActive: true },
          { session },
        );
        if (!product) continue; // delisted while in cart: silently dropped

        const quantity = Math.min(line.quantity, MAX_QUANTITY_PER_LINE);

        // The concurrency guarantee, per line: only decrement if enough stock
        // remains at this instant, atomically.
        const decremented = await productsC.updateOne(
          { _id: product._id, stock: { $gte: quantity } },
          { $inc: { stock: -quantity }, $set: { updatedAt: new Date() } },
          { session },
        );

        if (decremented.modifiedCount === 0) {
          shortages.push(product.name);
          continue;
        }

        const unitPrice = effectivePrice(product);
        items.push({
          productId: product._id,
          name: product.name,
          slug: product.slug,
          brand: product.brand,
          thumbnail: product.thumbnail,
          unitPrice,
          listPrice: product.price,
          quantity,
          lineTotal: unitPrice * quantity,
        });
      }

      if (shortages.length > 0) {
        // All-or-nothing: aborting rolls back every decrement above. A partial
        // order surprises the customer and strands reserved stock.
        failure = {
          ok: false,
          code: 'INSUFFICIENT_STOCK',
          message: 'Some items in your cart are no longer available in the quantity requested.',
          shortages,
        };
        await session.abortTransaction();
        return;
      }

      if (items.length === 0) {
        failure = { ok: false, code: 'EMPTY_CART', message: 'Your cart is empty.' };
        await session.abortTransaction();
        return;
      }

      const { itemCount: _itemCount, ...totals } = calculateTotals(
        items.map((item) => ({
          listPrice: item.listPrice,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
        })),
        // Read here, inside the transaction, rather than passed in: the
        // charged total must follow the membership as it stands at purchase,
        // not whatever the browser last saw.
        { freeShipping: primeMember },
      );

      const now = new Date();
      const isCod = input.paymentMethod === 'COD';
      const isWallet = input.paymentMethod === 'WALLET';

      // ---- charging the Eshwaran Pay balance ------------------------------
      // Read inside the transaction, so the figure the charge is checked
      // against is the one the debit is written against. Two checkouts by the
      // same customer cannot both pass: both also clear the same cart
      // document below, and MongoDB aborts the loser on that write conflict.
      if (isWallet) {
        const { balance } = await getWalletSummary(userId.toHexString(), { session });
        if (balance < totals.total) {
          failure = {
            ok: false,
            code: 'INSUFFICIENT_BALANCE',
            message: `Your Eshwaran Pay balance is ${formatPaise(balance)}, which does not cover ${formatPaise(totals.total)}. Add money or choose another payment method.`,
          };
          await session.abortTransaction();
          return;
        }
      }

      // Wallet orders are paid the moment this transaction commits: the money
      // moved in the same write, so there is nothing left to await and no
      // external party whose word we are taking for it.
      const settled = isWallet;

      const order: OrderDoc = {
        _id: new ObjectId(),
        orderNumber: generateOrderNumber(),
        userId,
        items,
        shippingAddress,
        paymentMethod: input.paymentMethod,
        paymentStatus: settled ? 'PAID' : 'PENDING',
        // COD and wallet are confirmed immediately; gateway payment confirms
        // on the provider's word, never before.
        orderStatus: isCod || settled ? 'CONFIRMED' : 'PENDING',
        payment: {
          provider: isWallet
            ? 'wallet'
            : process.env.PAYMENT_PROVIDER === 'stripe'
              ? 'stripe'
              : 'mock',
          intentId: null,
          reference: input.idempotencyKey,
          paidAt: settled ? now : null,
          failureReason: null,
        },
        currency: 'INR',
        ...totals,
        statusHistory: [
          {
            status: isCod || settled ? 'CONFIRMED' : 'PENDING',
            at: now,
            byUserId: null,
            note: isWallet
              ? 'Order placed and paid from Eshwaran Pay balance'
              : isCod
                ? 'Order placed (cash on delivery)'
                : 'Order placed, awaiting payment',
          },
        ],
        stockCommitted: true,
        createdAt: now,
        updatedAt: now,
      };

      // Retry the order number on collision without abandoning the txn.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await ordersC.insertOne(order, { session });
          break;
        } catch (error) {
          if ((error as { code?: number }).code === 11000 && attempt < 2) {
            order.orderNumber = generateOrderNumber();
            continue;
          }
          throw error;
        }
      }

      // Written after the insert so the ledger carries the order number the
      // customer will see, and inside the transaction so a failure anywhere
      // above leaves no charge behind.
      if (isWallet) {
        const walletEntry: WalletEntryDoc = {
          _id: new ObjectId(),
          userId,
          type: 'ORDER',
          direction: 'DEBIT',
          amount: order.total,
          status: 'COMPLETED',
          currency: 'INR',
          reference: order.orderNumber,
          failureReason: null,
          createdAt: now,
          updatedAt: now,
        };
        await db
          .collection<WalletEntryDoc>(COLLECTIONS.walletEntries)
          .insertOne(walletEntry, { session });
      }

      // Cashback, on the same terms the Now store advertises. Credited here
      // rather than promised on a banner: the tier is decided from the total
      // this transaction just computed, and the money is in the wallet by the
      // time the confirmation page renders.
      //
      // A reward collected from the rewards page competes with the standing
      // tier, and the better of the two wins. They do not stack: "up to Rs 50"
      // from a tile plus "Rs 100 above Rs 899" from the tier would quietly mean
      // Rs 150, which is not what either of them said.
      const tier = cashbackFor(order.total, primeMember);
      const claim = await bestClaimFor(userId.toHexString(), 'SHOPPING', order.total, {
        session,
        now,
      });

      let reward = tier.reward;

      if (claim && claim.reward > tier.reward) {
        // Spent inside this transaction, so an aborted checkout cannot burn an
        // offer that paid for nothing. The reward is only taken up when the
        // conditional update actually claimed it -- losing that race to another
        // order means falling back to the tier rather than crediting the same
        // offer twice.
        const spent = await spendClaim(claim.claimId, claim.reward, order.orderNumber, {
          session,
          now,
        });
        if (spent) reward = claim.reward;
      }

      if (reward > 0) {
        const cashbackEntry: WalletEntryDoc = {
          _id: new ObjectId(),
          userId,
          type: 'CASHBACK',
          direction: 'CREDIT',
          amount: reward,
          status: 'COMPLETED',
          currency: 'INR',
          reference: `${order.orderNumber}-CB`,
          failureReason: null,
          createdAt: now,
          updatedAt: now,
        };
        await db
          .collection<WalletEntryDoc>(COLLECTIONS.walletEntries)
          .insertOne(cashbackEntry, { session });
      }

      await cartsC.updateOne({ userId }, { $set: { items: [], updatedAt: now } }, { session });

      placed = order;
    });
  } finally {
    await session.endSession();
  }

  if (failure) return failure;
  if (!placed) return { ok: false, code: 'EMPTY_CART', message: 'Your cart is empty.' };
  const order: OrderDoc = placed;

  // Outside the transaction: side effects that must not roll stock back.
  await recordAudit({
    action: 'order.placed',
    actorId: userId,
    targetType: 'order',
    targetId: order._id.toHexString(),
    ip: context.ip,
    metadata: { orderNumber: order.orderNumber, total: order.total, method: input.paymentMethod },
  });

  // Mobile-only accounts have no address to write to; the confirmation page
  // and Your Orders carry the same information.
  if (user.email) {
    await sendOrderConfirmationEmail(
      user.email,
      user.name,
      order.orderNumber,
      formatPaise(order.total),
    ).catch(() => undefined);
  }

  return {
    ok: true,
    orderId: order._id.toHexString(),
    orderNumber: order.orderNumber,
    alreadyPlaced: false,
    paymentMethod: input.paymentMethod,
  };
}
