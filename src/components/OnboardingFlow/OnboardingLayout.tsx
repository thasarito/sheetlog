import type React from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "../../lib/utils";
import { Stepper } from "../ui/stepper";

interface OnboardingLayoutProps {
  title: string;
  subtitle?: string;
  stepCurrent: number;
  stepTotal: number;
  onBack?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function OnboardingLayout({
  title,
  subtitle,
  stepCurrent,
  stepTotal,
  onBack,
  children,
  footer,
  className,
}: OnboardingLayoutProps) {
  return (
    <div className={cn("flex h-full w-full flex-col bg-background", className)}>
      {/* Header */}
      <header className="mx-auto flex w-full max-w-[720px] items-center gap-4 px-6 pt-12 pb-4">
        <div className="flex-none">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-full p-2 hover:bg-muted transition-colors -ml-2"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : (
            <div className="h-10 w-10" />
          )}
        </div>
        <div className="flex-1 w-full">
          <Stepper total={stepTotal} current={stepCurrent} />
        </div>
        <div className="w-10 flex-none" />
      </header>

      {/* Content */}
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col overflow-y-auto px-8 py-6">
        <div className="mb-8 text-center space-y-3">
          {/* Illustration placeholder or slot could go here */}
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </div>

        <div className="flex-1 flex flex-col">{children}</div>
      </main>

      {/* Footer */}
      {footer && <div className="mx-auto w-full max-w-[720px] p-6 pt-2">{footer}</div>}
    </div>
  );
}
