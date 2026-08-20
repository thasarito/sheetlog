import type { ReactNode } from 'react';

type SettingsIconBadgeProps = {
  children: ReactNode;
  size?: 'compact' | 'prominent';
};

const SIZE_CLASSES = {
  compact: 'h-8 w-8 rounded-[9px]',
  prominent: 'h-10 w-10 rounded-[13px]',
} as const;

export function SettingsIconBadge({
  children,
  size = 'compact',
}: SettingsIconBadgeProps) {
  return (
    <span
      aria-hidden="true"
      data-settings-icon-badge=""
      className={`flex shrink-0 items-center justify-center bg-primary/10 text-primary ${SIZE_CLASSES[size]}`}
    >
      {children}
    </span>
  );
}
