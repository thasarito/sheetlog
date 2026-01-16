import { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import type { QuickNote, TransactionType } from "../../lib/types";
import { CURRENCIES } from "../../lib/currencies";
import { useOnboarding } from "../../hooks/useOnboarding";
import { DynamicIcon } from "../DynamicIcon";
import { InlinePicker } from "../ui/inline-picker";
import { FOR_OPTIONS } from "../TransactionFlow/constants";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "../ui/drawer";

interface QuickNoteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: QuickNote | null;
  onSave: (note: Omit<QuickNote, "id"> & { id?: string }) => void;
  onDelete?: () => void;
  transactionType: TransactionType;
}

const DEFAULT_ICON = "StickyNote";

export function QuickNoteEditor({
  open,
  onOpenChange,
  note,
  onSave,
  onDelete,
  transactionType,
}: QuickNoteEditorProps) {
  const { onboarding } = useOnboarding();
  const [draftLabel, setDraftLabel] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftCurrency, setDraftCurrency] = useState<string | undefined>(undefined);
  const [draftAccount, setDraftAccount] = useState<string | undefined>(undefined);
  const [draftForValue, setDraftForValue] = useState<string | undefined>(undefined);

  const accountNames = useMemo(
    () => onboarding.accounts.map((a) => a.name),
    [onboarding.accounts]
  );

  const isTransfer = transactionType === "transfer";
  const forToOptions = isTransfer ? accountNames : FOR_OPTIONS;
  const forToLabel = isTransfer ? "To" : "For";

  // Reset draft state when drawer opens
  useEffect(() => {
    if (open) {
      setDraftLabel(note?.label ?? "");
      setDraftNote(note?.note ?? "");
      setDraftCurrency(note?.currency);
      setDraftAccount(note?.account);
      setDraftForValue(note?.forValue);
    }
  }, [open, note]);

  const isValid = draftLabel.trim().length > 0 && draftNote.trim().length > 0;
  const isEditing = note !== null;

  function handleSave() {
    if (!isValid) return;
    onSave({
      id: note?.id,
      icon: DEFAULT_ICON,
      label: draftLabel.trim(),
      note: draftNote.trim(),
      currency: draftCurrency,
      account: draftAccount,
      forValue: draftForValue,
    });
    onOpenChange(false);
  }

  function handleDelete() {
    onDelete?.();
    onOpenChange(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[80vh]!">
        <DrawerHeader>
          <DrawerTitle>{isEditing ? "Edit Quick Note" : "Add Quick Note"}</DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-4">
          {/* Preview */}
          <div className="flex justify-center py-2">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card">
                <DynamicIcon name={DEFAULT_ICON} className="h-5 w-5 text-foreground" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {draftLabel || "Label"}
              </span>
            </div>
          </div>

          {/* Label Input */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Label (shown in menu)
            </span>
            <input
              type="text"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="e.g., Coffee"
              maxLength={12}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          {/* Note Input */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Note text (pre-filled when selected)
            </span>
            <textarea
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              placeholder="e.g., Morning coffee at the usual place"
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </label>

          {/* Optional Transaction Fields */}
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Optional: Pre-fill transaction fields (leave empty for defaults)
            </p>

            {/* Currency */}
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-16">
                Currency
              </span>
              <InlinePicker
                label="Currency"
                labelHidden
                value={draftCurrency ?? null}
                options={[...CURRENCIES]}
                onChange={(value) => setDraftCurrency(value)}
                stretch
                className="flex-1"
              />
              {draftCurrency && (
                <button
                  type="button"
                  onClick={() => setDraftCurrency(undefined)}
                  className="p-1.5 rounded-full hover:bg-surface transition-colors"
                  aria-label="Clear currency"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Account and For/To pickers in 2-column grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Account
                  </span>
                  {draftAccount && (
                    <button
                      type="button"
                      onClick={() => setDraftAccount(undefined)}
                      className="p-0.5 rounded-full hover:bg-surface transition-colors"
                      aria-label="Clear account"
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <InlinePicker
                  label="Account"
                  labelHidden
                  value={draftAccount ?? null}
                  options={accountNames}
                  onChange={(value) => setDraftAccount(value)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {forToLabel}
                  </span>
                  {draftForValue && (
                    <button
                      type="button"
                      onClick={() => setDraftForValue(undefined)}
                      className="p-0.5 rounded-full hover:bg-surface transition-colors"
                      aria-label={`Clear ${forToLabel.toLowerCase()}`}
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <InlinePicker
                  label={forToLabel}
                  labelHidden
                  value={draftForValue ?? null}
                  options={forToOptions}
                  onChange={(value) => setDraftForValue(value)}
                />
              </div>
            </div>
          </div>

        </div>

        <DrawerFooter className="flex-col gap-2">
          {isEditing && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="w-full rounded-2xl border border-danger py-3 text-sm font-semibold text-danger"
            >
              Delete Quick Note
            </button>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-muted-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isValid}
              className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
