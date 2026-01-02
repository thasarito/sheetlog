import { Link } from "@tanstack/react-router";

import { OnboardingLayout } from "./OnboardingLayout";
import type { ScreenMeta } from "./types";

type ConnectScreenProps = {
  meta: ScreenMeta;
  isConnecting: boolean;
  onConnect: () => void;
};

export function ConnectScreen({
  meta,
  isConnecting,
  onConnect,
}: ConnectScreenProps) {
  return (
    <OnboardingLayout
      title="Let's get started"
      subtitle="Never a better time than now to start thinking about how you manage your finances with ease."
      stepCurrent={meta.stepNumber}
      stepTotal={meta.totalSteps}
    >
      <div className="flex flex-col items-center justify-center flex-1 gap-8 mt-12">
        <div className="relative"></div>

        <div className="w-full space-y-4 mt-auto">
          <button
            type="button"
            className="w-full flex items-center justify-center gap-3 rounded-md bg-white border border-slate-200 py-3 px-4 text-base font-medium text-slate-700 hover:bg-slate-50 transition active:scale-95 disabled:opacity-60 shadow-sm"
            onClick={onConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              "Connecting..."
            ) : (
              <>
                <img src="/google-logo.svg" alt="Google" className="w-5 h-5" />
                <span>Sign in with Google</span>
              </>
            )}
          </button>

          <div className="text-center">
            <Link
              to="/privacy"
              className="text-xs text-muted-foreground hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </OnboardingLayout>
  );
}
