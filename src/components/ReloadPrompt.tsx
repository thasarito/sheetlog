import { useRegisterSW } from "virtual:pwa-register/react";

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      if (r) console.log("SW Registered: " + r);
    },
    onRegisterError(error: unknown) {
      console.log("SW registration error", error);
    },
  });

  const close = () => {
    setNeedRefresh(false);
  };

  return (
    <div className="ReloadPrompt-container">
      {needRefresh && (
        <div className="fixed bottom-0 right-0 left-0 z-50 p-4 md:bottom-4 md:right-4 md:left-auto">
          <div className="bg-foreground text-background rounded-lg p-4 flex flex-col gap-2 border border-border">
            <div className="mb-2 font-bold">New content available</div>
            <div className="text-sm mb-4">
              Click on reload button to update.
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-1 rounded border border-current text-sm font-medium"
                onClick={() => updateServiceWorker(true)}
              >
                Reload
              </button>
              <button
                type="button"
                className="px-3 py-1 rounded border border-transparent text-sm font-medium opacity-80"
                onClick={() => close()}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
