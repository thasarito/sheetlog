import type React from "react";
import { DEFAULT_ACCOUNT_ICON, ICON_MAP, type IconName } from "../lib/icons";

type DynamicIconProps = {
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
  const iconName = (name || fallback) as IconName;
  const Icon = ICON_MAP[iconName];

  if (!Icon) {
    const FallbackIcon = ICON_MAP[fallback as IconName];
    return FallbackIcon ? (
      <FallbackIcon className={className} style={style} />
    ) : null;
  }

  return <Icon className={className} style={style} />;
}
