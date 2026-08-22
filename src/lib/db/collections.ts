import type { Collection } from 'mongodb';

import type { CartDoc } from '@/models/cart';
import type { CategoryDoc } from '@/models/category';
import type { OrderDoc } from '@/models/order';
import type { ProductDoc } from '@/models/product';
import type { ReviewDoc } from '@/models/review';
import type {
  AuditLogDoc,
  EmailVerificationTokenDoc,
  OtpCodeDoc,
  PasswordResetTokenDoc,
  RateLimitDoc,
  SessionDoc,
} from '@/models/security';
import type { UserDoc } from '@/models/user';
import type { GiftCardDoc } from '@/models/gift-card';
import type { PrimeMembershipDoc } from '@/models/prime';
import type { BusBookingDoc } from '@/models/bus-booking';
import type { CorporateEnquiryDoc } from '@/models/corporate-enquiry';
import type { RewardClaimDoc } from '@/models/reward-claim';
import type { SavedCardDoc } from '@/models/saved-card';
import type { SupportTicketDoc } from '@/models/support-ticket';
import type { InsurancePolicyDoc } from '@/models/insurance-policy';
import type { TransitAccountDoc, TransitEntryDoc } from '@/models/transit';
import type { BillPaymentDoc, SavedBillerDoc } from '@/models/bill-payment';
import type { AutoReloadDoc, ContentCreditDoc } from '@/models/content-credit';
import type { GiftOrderDoc } from '@/models/gift-order';
import type { HotelBookingDoc } from '@/models/hotel-booking';
import type { TrainBookingDoc } from '@/models/train-booking';
import type { RechargeDoc } from '@/models/recharge';
import type { VideoEntitlementDoc } from '@/models/video';
import type { WalletEntryDoc } from '@/models/wallet';

import { getDb } from './client';

import '@/lib/server-guard';

/**
 * Typed collection accessors.
 *
 * Every query in the app goes through one of these, so the driver's generics
 * apply and a typo in a field name is a compile error rather than a silent
 * `undefined` in a filter -- which, in a filter, means "match everything".
 */

export const COLLECTIONS = {
  users: 'users',
  products: 'products',
  categories: 'categories',
  carts: 'carts',
  orders: 'orders',
  reviews: 'reviews',
  sessions: 'sessions',
  passwordResetTokens: 'passwordResetTokens',
  emailVerificationTokens: 'emailVerificationTokens',
  auditLogs: 'auditLogs',
  rateLimits: 'rateLimits',
  otpCodes: 'otpCodes',
  walletEntries: 'walletEntries',
  giftCards: 'giftCards',
  primeMemberships: 'primeMemberships',
  videoEntitlements: 'videoEntitlements',
  recharges: 'recharges',
  busBookings: 'busBookings',
  trainBookings: 'trainBookings',
  hotelBookings: 'hotelBookings',
  giftOrders: 'giftOrders',
  corporateEnquiries: 'corporateEnquiries',
  rewardClaims: 'rewardClaims',
  supportTickets: 'supportTickets',
  savedCards: 'savedCards',
  insurancePolicies: 'insurancePolicies',
  transitAccounts: 'transitAccounts',
  transitEntries: 'transitEntries',
  billPayments: 'billPayments',
  savedBillers: 'savedBillers',
  contentCredits: 'contentCredits',
  autoReloads: 'autoReloads',
} as const;

export async function usersCollection(): Promise<Collection<UserDoc>> {
  return (await getDb()).collection<UserDoc>(COLLECTIONS.users);
}

export async function productsCollection(): Promise<Collection<ProductDoc>> {
  return (await getDb()).collection<ProductDoc>(COLLECTIONS.products);
}

export async function categoriesCollection(): Promise<Collection<CategoryDoc>> {
  return (await getDb()).collection<CategoryDoc>(COLLECTIONS.categories);
}

export async function cartsCollection(): Promise<Collection<CartDoc>> {
  return (await getDb()).collection<CartDoc>(COLLECTIONS.carts);
}

export async function ordersCollection(): Promise<Collection<OrderDoc>> {
  return (await getDb()).collection<OrderDoc>(COLLECTIONS.orders);
}

export async function reviewsCollection(): Promise<Collection<ReviewDoc>> {
  return (await getDb()).collection<ReviewDoc>(COLLECTIONS.reviews);
}

export async function sessionsCollection(): Promise<Collection<SessionDoc>> {
  return (await getDb()).collection<SessionDoc>(COLLECTIONS.sessions);
}

export async function passwordResetTokensCollection(): Promise<Collection<PasswordResetTokenDoc>> {
  return (await getDb()).collection<PasswordResetTokenDoc>(COLLECTIONS.passwordResetTokens);
}

export async function emailVerificationTokensCollection(): Promise<
  Collection<EmailVerificationTokenDoc>
> {
  return (await getDb()).collection<EmailVerificationTokenDoc>(COLLECTIONS.emailVerificationTokens);
}

export async function auditLogsCollection(): Promise<Collection<AuditLogDoc>> {
  return (await getDb()).collection<AuditLogDoc>(COLLECTIONS.auditLogs);
}

export async function otpCodesCollection(): Promise<Collection<OtpCodeDoc>> {
  return (await getDb()).collection<OtpCodeDoc>(COLLECTIONS.otpCodes);
}

export async function rateLimitsCollection(): Promise<Collection<RateLimitDoc>> {
  return (await getDb()).collection<RateLimitDoc>(COLLECTIONS.rateLimits);
}

export async function walletEntriesCollection(): Promise<Collection<WalletEntryDoc>> {
  return (await getDb()).collection<WalletEntryDoc>(COLLECTIONS.walletEntries);
}

export async function giftCardsCollection(): Promise<Collection<GiftCardDoc>> {
  return (await getDb()).collection<GiftCardDoc>(COLLECTIONS.giftCards);
}

export async function primeMembershipsCollection(): Promise<Collection<PrimeMembershipDoc>> {
  return (await getDb()).collection<PrimeMembershipDoc>(COLLECTIONS.primeMemberships);
}

export async function videoEntitlementsCollection(): Promise<Collection<VideoEntitlementDoc>> {
  return (await getDb()).collection<VideoEntitlementDoc>(COLLECTIONS.videoEntitlements);
}

export async function rechargesCollection(): Promise<Collection<RechargeDoc>> {
  return (await getDb()).collection<RechargeDoc>(COLLECTIONS.recharges);
}

export async function busBookingsCollection(): Promise<Collection<BusBookingDoc>> {
  return (await getDb()).collection<BusBookingDoc>(COLLECTIONS.busBookings);
}

export async function trainBookingsCollection(): Promise<Collection<TrainBookingDoc>> {
  return (await getDb()).collection<TrainBookingDoc>(COLLECTIONS.trainBookings);
}

export async function hotelBookingsCollection(): Promise<Collection<HotelBookingDoc>> {
  return (await getDb()).collection<HotelBookingDoc>(COLLECTIONS.hotelBookings);
}

export async function giftOrdersCollection(): Promise<Collection<GiftOrderDoc>> {
  return (await getDb()).collection<GiftOrderDoc>(COLLECTIONS.giftOrders);
}

export async function corporateEnquiriesCollection(): Promise<Collection<CorporateEnquiryDoc>> {
  return (await getDb()).collection<CorporateEnquiryDoc>(COLLECTIONS.corporateEnquiries);
}

export async function rewardClaimsCollection(): Promise<Collection<RewardClaimDoc>> {
  return (await getDb()).collection<RewardClaimDoc>(COLLECTIONS.rewardClaims);
}

export async function supportTicketsCollection(): Promise<Collection<SupportTicketDoc>> {
  return (await getDb()).collection<SupportTicketDoc>(COLLECTIONS.supportTickets);
}

export async function savedCardsCollection(): Promise<Collection<SavedCardDoc>> {
  return (await getDb()).collection<SavedCardDoc>(COLLECTIONS.savedCards);
}

export async function insurancePoliciesCollection(): Promise<Collection<InsurancePolicyDoc>> {
  return (await getDb()).collection<InsurancePolicyDoc>(COLLECTIONS.insurancePolicies);
}

export async function transitAccountsCollection(): Promise<Collection<TransitAccountDoc>> {
  return (await getDb()).collection<TransitAccountDoc>(COLLECTIONS.transitAccounts);
}

export async function transitEntriesCollection(): Promise<Collection<TransitEntryDoc>> {
  return (await getDb()).collection<TransitEntryDoc>(COLLECTIONS.transitEntries);
}

export async function billPaymentsCollection(): Promise<Collection<BillPaymentDoc>> {
  return (await getDb()).collection<BillPaymentDoc>(COLLECTIONS.billPayments);
}

export async function savedBillersCollection(): Promise<Collection<SavedBillerDoc>> {
  return (await getDb()).collection<SavedBillerDoc>(COLLECTIONS.savedBillers);
}

export async function contentCreditsCollection(): Promise<Collection<ContentCreditDoc>> {
  return (await getDb()).collection<ContentCreditDoc>(COLLECTIONS.contentCredits);
}

export async function autoReloadsCollection(): Promise<Collection<AutoReloadDoc>> {
  return (await getDb()).collection<AutoReloadDoc>(COLLECTIONS.autoReloads);
}
