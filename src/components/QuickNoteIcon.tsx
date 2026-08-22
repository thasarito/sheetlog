import type React from 'react';
import { resolveQuickNoteIconName } from '../lib/quickNoteBrands';
import { DynamicIcon } from './DynamicIcon';

type QuickNoteIconProps = {
  icon: string | undefined;
  label: string;
  fallback?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function QuickNoteIcon({
  icon,
  label,
  fallback = 'Tag',
  className,
  style,
}: QuickNoteIconProps) {
  return (
    <DynamicIcon
      name={resolveQuickNoteIconName(icon, label, fallback)}
      fallback={fallback}
      className={className}
      style={style}
    />
  );
}
