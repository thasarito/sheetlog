import type React from "react";
import * as LucideIcons from "lucide-react";
import { DEFAULT_ACCOUNT_ICON } from "../lib/icons";

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
  const iconName = (name || fallback) as keyof typeof LucideIcons;
  const Icon = LucideIcons[iconName] as LucideIcons.LucideIcon | undefined;

  if (!Icon) {
    const FallbackIcon = LucideIcons[
      fallback as keyof typeof LucideIcons
    ] as LucideIcons.LucideIcon;
    return <FallbackIcon className={className} style={style} />;
  }

  return <Icon className={className} style={style} />;
}
