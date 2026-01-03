import { Outlet } from "@tanstack/react-router";
import AppProvider from "./providers";
import { Toaster } from "./ui/sonner";

export function AppShell() {
  return (
    <AppProvider>
      <div className="flex h-full w-full flex-col overflow-hidden">
        <Outlet />
        <Toaster />
      </div>
    </AppProvider>
  );
}
