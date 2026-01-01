'use client';

import React from 'react';

interface ToastProps {
  open: boolean;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
}

export function Toast({ open, message, actionLabel, onAction, onClose }: ToastProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 w-[92%] max-w-sm -translate-x-1/2">
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-900/95 px-4 py-3 text-sm text-slate-100 shadow-soft">
        <span>{message}</span>
        <div className="flex items-center gap-2">
          {actionLabel ? (
            <button
              className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide"
              onClick={onAction}
            >
              {actionLabel}
            </button>
          ) : null}
          <button className="text-xs text-slate-300" onClick={onClose} aria-label="Dismiss">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
