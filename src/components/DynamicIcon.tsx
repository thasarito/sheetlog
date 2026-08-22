import type React from 'react';
import { DEFAULT_ACCOUNT_ICON, ICON_MAP, type IconName } from '../lib/icons';
import { isQuickNoteBrandName } from '../lib/quickNoteBrands';
import { QuickNoteBrandIcon } from './QuickNoteBrandIcon';

export type DynamicIconProps = {
  name: string | undefined;
  fallback?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function DynamicIcon({
  name,
  fallback = DEFAULT_ACCOUNT_ICON,
  className,
  style,
}: DynamicIconProps) {
  const resolvedName = name || fallback;

  if (isQuickNoteBrandName(resolvedName)) {
    return (
      <QuickNoteBrandIcon
        name={resolvedName}
        className={className}
        style={style}
      />
    );
  }

  const Icon = ICON_MAP[resolvedName as IconName];
  if (Icon) return <Icon className={className} style={style} />;

  if (isQuickNoteBrandName(fallback)) {
    return (
      <QuickNoteBrandIcon
        name={fallback}
        className={className}
        style={style}
      />
    );
  }

  const FallbackIcon = ICON_MAP[fallback as IconName];
  return FallbackIcon ? (
    <FallbackIcon className={className} style={style} />
  ) : null;
}
