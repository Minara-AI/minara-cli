import { get, del } from './client.js';
import type { PlansResponse, CheckoutSession, CryptoCheckout } from '../types.js';

/** Get all subscription plans and credit packages */
export function getPlans() {
  return get<PlansResponse>('/payment/plans');
}

/** Create a Stripe checkout session for a subscription plan */
export function checkoutPlan(token: string, planId: string, successUrl: string, cancelUrl: string) {
  return get<CheckoutSession>(`/payment/plans/${planId}/checkout`, {
    token,
    query: { successUrl, cancelUrl },
  });
}

/** Create a crypto checkout for a subscription plan */
export function cryptoCheckoutPlan(token: string, planId: string) {
  return get<CryptoCheckout>(`/payment/plans/${planId}/crypto-checkout`, { token });
}

/** Get crypto checkout pay amount for a plan */
export function getCryptoPayAmount(token: string, planId: string) {
  return get<Record<string, unknown>>(`/payment/plans/${planId}/crypto-checkout/payAmount`, { token });
}

/** Simulate crypto checkout for a plan */
export function simulateCryptoCheckout(token: string, planId: string) {
  return get<Record<string, unknown>>(`/payment/plans/${planId}/crypto-checkout/simulate`, { token });
}

/** Create a Stripe checkout session for a credit package */
export function checkoutPackage(token: string, packageId: string, successUrl: string, cancelUrl: string) {
  return get<CheckoutSession>(`/payment/packages/${packageId}/checkout`, {
    token,
    query: { successUrl, cancelUrl },
  });
}

/** Create a crypto checkout for a credit package */
export function cryptoCheckoutPackage(token: string, packageId: string) {
  return get<CryptoCheckout>(`/payment/packages/${packageId}/crypto-checkout`, { token });
}

/** Cancel current subscription */
export function cancelSubscription(token: string) {
  return del<Record<string, unknown>>('/payment/subscription', { token });
}
