import { Outlet } from "@tanstack/react-router";
import AppProvider from "./providers";
import { Toaster } from "./ui/sonner";
import { ReloadPrompt } from "./ReloadPrompt";

export function AppShell() {
  return (
    <AppProvider>
      <div className="flex h-full w-full flex-col overflow-hidden">
        <Outlet />
        <Toaster />
        <ReloadPrompt />
      </div>
    </AppProvider>
  );
}
