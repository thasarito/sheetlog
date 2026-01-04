import { AuthUserProfile } from "./AuthUserProfile";

export function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-3">
      {/* Logo and brand name */}
      <div className="flex items-center gap-2">
        <img src="/icon.svg" alt="Sheetlog logo" className="w-8 h-8" />
        <span className="text-lg font-semibold text-foreground">Sheetlog</span>
      </div>
      {/* User profile - compact mode shows only avatar */}
      <AuthUserProfile compact />
    </header>
  );
}
