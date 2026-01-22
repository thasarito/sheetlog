export type LemonSqueezyPlan = 'personal' | 'pro';

function cleanEnvValue(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const personalCheckoutUrl = cleanEnvValue(
  import.meta.env.VITE_LEMONSQUEEZY_PERSONAL_CHECKOUT_URL,
);
const proCheckoutUrl = cleanEnvValue(import.meta.env.VITE_LEMONSQUEEZY_PRO_CHECKOUT_URL);

export const lemonsqueezy = {
  personalCheckoutUrl,
  proCheckoutUrl,
};

export function getCheckoutUrl(plan: LemonSqueezyPlan): string | undefined {
  return plan === 'personal' ? personalCheckoutUrl : proCheckoutUrl;
}

