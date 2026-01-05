import { useState } from "react";
import { Settings } from "lucide-react";
import { AuthUserProfile } from "./AuthUserProfile";
import { SettingsDrawer } from "./SettingsDrawer";

type HeaderProps = {
  showSettings?: boolean;
  onResync?: () => void;
  isResyncing?: boolean;
  onToast?: (message: string) => void;
};

export function Header({
  showSettings = false,
  onResync,
  isResyncing = false,
  onToast,
}: HeaderProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-4 py-3">
      {/* Logo and brand name */}
      <div className="flex items-center gap-2">
        <img src="/icon.svg" alt="Sheetlog logo" className="w-8 h-8" />
        <span className="text-lg font-semibold text-foreground">Sheetlog</span>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {showSettings && (
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:bg-surface"
            aria-label="Open settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
        <AuthUserProfile compact />
      </div>

      {/* Settings Drawer */}
      {showSettings && onResync && onToast && (
        <SettingsDrawer
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          onResync={onResync}
          isResyncing={isResyncing}
          onToast={onToast}
        />
      )}
    </header>
  );
}
