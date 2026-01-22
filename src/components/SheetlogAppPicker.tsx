import { CheckCircle2, CircleDotDashed, Lock } from 'lucide-react';
import type { SheetlogAppId } from '../lib/sheetlogApps';
import { SHEETLOG_APPS } from '../lib/sheetlogApps';
import { cn } from '../lib/utils';

type SheetlogAppPickerProps = {
  value: SheetlogAppId | null;
  onChange: (next: SheetlogAppId) => void;
};

export function SheetlogAppPicker({ value, onChange }: SheetlogAppPickerProps) {
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col px-6 pb-safe pt-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          SheetLog Trackers
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Pick what you want to log</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Each tracker writes to a spreadsheet in your Google Drive. Start with one, add more later.
        </p>
      </div>

      <div className="mt-6 grid gap-3">
        {SHEETLOG_APPS.map((app) => {
          const isSelected = value === app.id;
          const isDisabled = app.status !== 'available';

          return (
            <button
              key={app.id}
              type="button"
              onClick={() => onChange(app.id)}
              disabled={isDisabled}
              className={cn(
                'w-full rounded-2xl border p-4 text-left transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-primary/40',
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{app.name}</p>
                    {app.status === 'coming-soon' ? (
                      <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        Coming soon
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{app.description}</p>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  {app.status === 'available' ? (
                    isSelected ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : (
                      <CircleDotDashed className="h-5 w-5 text-muted-foreground" />
                    )
                  ) : (
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-xs leading-5 text-muted-foreground">
        Tip: install SheetLog to your home screen for one-tap logging.
      </p>
    </div>
  );
}
