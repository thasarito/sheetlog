import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

export function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
        <div className="text-sm font-semibold tracking-wide">SheetLog</div>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link className="transition hover:text-foreground" to="/">
            Home
          </Link>
          <Link className="transition hover:text-foreground" to="/privacy">
            Privacy
          </Link>
          <Link className="transition hover:text-foreground" to="/terms">
            Terms
          </Link>
        </nav>
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">{children}</div>
      </main>
    </div>
  );
}
