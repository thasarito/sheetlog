import { Check } from 'lucide-react';
import { OnboardingLayout } from './OnboardingLayout';
import type { ScreenMeta } from './types';

type DoneScreenProps = {
  meta: ScreenMeta;
};

export function DoneScreen({ meta }: DoneScreenProps) {
  // In a real app we might have a final 'Finish' action, but here we just show success.
  // The parent OnboardingFlow might handle the redirection or completion state.
  return (
    <OnboardingLayout
      title="All set!"
      subtitle="You're ready to start logging."
      stepCurrent={meta.stepNumber}
      stepTotal={meta.totalSteps}
    >
      <div className="flex flex-col items-center justify-center h-full pb-20 space-y-6 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-blue-400 text-primary-foreground ring-4 ring-background">
            <Check className="h-12 w-12" strokeWidth={3} />
          </div>
        </div>

        <div className="space-y-2 max-w-xs">
          <h3 className="text-xl font-bold tracking-tight">Setup Complete</h3>
          <p className="text-muted-foreground">Your Google Sheet is connected and configured.</p>
        </div>
      </div>
      {/* No footer button needed really, or maybe a "Go to Dashboard" if handled here */}
    </OnboardingLayout>
  );
}
