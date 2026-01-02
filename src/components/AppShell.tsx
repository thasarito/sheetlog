import { Outlet } from "@tanstack/react-router";
import AppProvider from "./providers";

export function AppShell() {
  return (
    <AppProvider>
      <div className="flex h-full w-full flex-col overflow-hidden">
        <Outlet />
      </div>
    </AppProvider>
  );
}
