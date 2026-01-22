import { getCheckoutUrl, type LemonSqueezyPlan } from '../lib/lemonsqueezy';

type LemonSqueezyCheckoutButtonProps = {
  plan: LemonSqueezyPlan;
  className?: string;
  label: string;
};

export function LemonSqueezyCheckoutButton({
  plan,
  className,
  label,
}: LemonSqueezyCheckoutButtonProps) {
  const checkoutUrl = getCheckoutUrl(plan);

  if (!checkoutUrl) {
    return (
      <button
        type="button"
        disabled
        className={className}
        aria-disabled="true"
        title="Checkout is not configured yet"
      >
        {label}
      </button>
    );
  }

  return (
    <a
      href={checkoutUrl}
      className={className}
      target="_blank"
      rel="noreferrer"
      aria-label={`${label} (opens checkout)`}
    >
      {label}
    </a>
  );
}

