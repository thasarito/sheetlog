import { ChevronDown } from 'lucide-react';
import type { ReactNode, Ref } from 'react';

export type SettingsControlSectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  icon: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  headerRef?: Ref<HTMLDivElement>;
  children: ReactNode;
};

export function SettingsControlSection({
  id,
  eyebrow,
  title,
  summary,
  icon,
  expanded,
  onToggle,
  headerRef,
  children,
}: SettingsControlSectionProps) {
  const contentId = `settings-section-${id}-content`;

  return (
    <div
      ref={headerRef}
      id={`settings-section-${id}`}
      className="overflow-hidden rounded-[20px] border border-border/70 bg-card"
      style={{ scrollMarginTop: 'var(--dashboard-header-height, 68px)' }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
        className="flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-surface-2 text-primary">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {eyebrow}
          </span>
          <span className="mt-0.5 block text-[17px] font-semibold text-foreground">{title}</span>
          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
            {summary}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      {expanded ? (
        <div
          id={contentId}
          role="region"
          aria-label={title}
          className="border-t border-border/70"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
