import { Link } from '@tanstack/react-router';

import { OnboardingLayout } from './OnboardingLayout';
import type { ScreenMeta } from './types';

type ConnectScreenProps = {
  meta: ScreenMeta;
  isConnecting: boolean;
  errorMessage?: string | null;
  onConnect: () => void;
};

const googleLogoUrl = `${import.meta.env.BASE_URL}google-logo.svg`;

export function ConnectScreen({
  meta,
  isConnecting,
  errorMessage,
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
          {errorMessage ? (
            <p
              role="alert"
              className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              {errorMessage}
            </p>
          ) : null}
          <button
            type="button"
            className="w-full flex items-center justify-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-base font-medium text-foreground transition hover:bg-surface-2 active:scale-95 disabled:opacity-60"
            onClick={onConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              'Connecting...'
            ) : (
              <>
                <img src={googleLogoUrl} alt="Google" className="w-5 h-5" />
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
