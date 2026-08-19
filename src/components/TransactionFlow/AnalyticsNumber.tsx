import NumberFlow, { type NumberFlowElement } from '@number-flow/react';
import { useLayoutEffect, useRef } from 'react';
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
  duration: 260,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};
const OPACITY_TIMING: EffectTiming = {
  duration: 140,
  easing: 'ease-out',
};

export function AnalyticsNumber(props: AnalyticsNumberProps) {
  const { value, className, presentation } = props;
  const flowRef = useRef<NumberFlowElement | null>(null);
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

  useLayoutEffect(() => {
    const flow = flowRef.current;
    if (flow?.childNodes.length) flow.replaceChildren();
  });

  return (
    <span className={cn('inline-flex tabular-nums', className)} data-testid="analytics-number">
      <span className="sr-only">{settledText}</span>
      <NumberFlow
        ref={flowRef}
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
