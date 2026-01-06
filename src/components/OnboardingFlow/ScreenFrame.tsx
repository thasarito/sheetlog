import type React from 'react';
import type { ScreenMeta } from './types';

type ScreenFrameProps = ScreenMeta & {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function ScreenFrame({
  title,
  subtitle,
  icon,
  stepLabel,
  stepNumber,
  totalSteps,
  progressPercent,
  children,
  footer,
}: ScreenFrameProps) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-[32px] border border-border/70 bg-card/90 backdrop-blur sm:min-h-[620px]">
      <div className="border-b border-border/70 bg-card/80 px-5 pb-4 pt-5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            Step {stepNumber} of {totalSteps}
          </span>
          <span className="max-w-[45%] truncate text-right">{stepLabel}</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-4 flex items-start gap-3">
          <div className="rounded-2xl bg-primary/15 p-3 text-primary">{icon}</div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 px-5 py-5">{children}</div>
      {footer ? (
        <div className="border-t border-border/70 bg-card/80 px-5 pb-6 pt-4">{footer}</div>
      ) : (
        <div className="pb-4" />
      )}
      <div className="flex justify-center pb-4">
        <div className="h-1 w-20 rounded-full bg-surface-3" />
      </div>
    </div>
  );
}
