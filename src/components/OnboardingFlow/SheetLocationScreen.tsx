import React from "react";
import { Folder } from "lucide-react";
import { ScreenFrame } from "./ScreenFrame";
import type { LocationMode, ScreenMeta } from "./types";

type SheetLocationScreenProps = {
  meta: ScreenMeta;
  locationMode: LocationMode;
  folderIdInput: string;
  isSettingUpSheet: boolean;
  onLocationModeChange: (mode: LocationMode) => void;
  onFolderIdChange: (value: string) => void;
  onSubmit: () => void;
};

export function SheetLocationScreen({
  meta,
  locationMode,
  folderIdInput,
  isSettingUpSheet,
  onLocationModeChange,
  onFolderIdChange,
  onSubmit,
}: SheetLocationScreenProps) {
  return (
    <ScreenFrame
      {...meta}
      title="Pick sheet location"
      subtitle="Choose where SheetLog_DB should live in Drive."
      icon={<Folder className="h-5 w-5" />}
      footer={
        <button
          type="button"
          className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-60"
          onClick={onSubmit}
          disabled={
            isSettingUpSheet ||
            (locationMode === "folder" && !folderIdInput.trim())
          }
        >
          {isSettingUpSheet ? "Setting up..." : "Create or Locate Sheet"}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex rounded-2xl border border-border/70 bg-surface-2/80 p-1 text-xs font-semibold">
          <label
            className={[
              "flex flex-1 cursor-pointer items-center justify-center rounded-2xl px-3 py-2 transition",
              locationMode === "root"
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <input
              type="radio"
              name="sheet-location"
              checked={locationMode === "root"}
              onChange={() => onLocationModeChange("root")}
              className="sr-only"
            />
            <span>My Drive</span>
          </label>
          <label
            className={[
              "flex flex-1 cursor-pointer items-center justify-center rounded-2xl px-3 py-2 transition",
              locationMode === "folder"
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <input
              type="radio"
              name="sheet-location"
              checked={locationMode === "folder"}
              onChange={() => onLocationModeChange("folder")}
              className="sr-only"
            />
            <span>Specific folder</span>
          </label>
        </div>
        {locationMode === "folder" ? (
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              Drive folder ID
            </label>
            <input
              type="text"
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground"
              placeholder="Drive folder ID"
              value={folderIdInput}
              onChange={(event) => onFolderIdChange(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Find it in the folder URL after /folders/.
            </p>
          </div>
        ) : null}
        <div className="rounded-2xl border border-border/70 bg-surface-2/80 px-4 py-3 text-xs text-muted-foreground">
          We will create or reuse SheetLog_DB and add the headers.
        </div>
      </div>
    </ScreenFrame>
  );
}
