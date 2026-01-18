'use client';

export function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex h-2.5 w-2.5 items-center justify-center rounded-full ${
        online ? 'bg-success' : 'bg-warning'
      }`}
      aria-label={online ? 'Online' : 'Offline'}
      title={online ? 'Online' : 'Offline'}
    />
  );
}
