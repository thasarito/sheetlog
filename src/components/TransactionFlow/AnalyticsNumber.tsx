import NumberFlow from '@number-flow/react';
import { cn } from '../../lib/utils';
import { formatAnalyticsAmount } from './analytics';

type AnalyticsNumberProps = {
  value: number;
  className?: string;
} & (
  | { presentation: 'currency'; currency: string }
  | { presentation: 'percentage'; currency?: never }
);

const TRANSFORM_TIMING: EffectTiming = {
  duration: 350,
  easing: 'ease-out',
};
const OPACITY_TIMING: EffectTiming = {
  duration: 180,
  easing: 'ease-out',
};

export function AnalyticsNumber(props: AnalyticsNumberProps) {
  const { value, className, presentation } = props;
  const percentageValue = Math.round(value);
  const settledText =
    presentation === 'currency'
      ? formatAnalyticsAmount(value, props.currency)
      : `${percentageValue}%`;
  const prefix =
    presentation === 'currency'
      ? `${value < 0 ? '-' : ''}${
          props.currency === 'THB' ? '฿' : props.currency === 'USD' ? '$' : props.currency
        }`
      : undefined;

  return (
    <span className={cn('inline-flex tabular-nums', className)} data-testid="analytics-number">
      <span className="sr-only">{settledText}</span>
      <NumberFlow
        aria-hidden="true"
        value={presentation === 'currency' ? Math.abs(value) : percentageValue}
        prefix={prefix}
        suffix={presentation === 'percentage' ? '%' : undefined}
        format={presentation === 'currency' ? { maximumFractionDigits: 2 } : undefined}
        transformTiming={TRANSFORM_TIMING}
        opacityTiming={OPACITY_TIMING}
        isolate
      />
    </span>
  );
}
