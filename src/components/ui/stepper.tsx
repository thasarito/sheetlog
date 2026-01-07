import { cn } from '../../lib/utils';

interface StepperProps {
  total: number;
  current: number;
  className?: string;
}

export function Stepper({ total, current, className }: StepperProps) {
  return (
    <div className={cn('flex w-full gap-2', className)}>
      {Array.from({ length: total }).map((_, i) => {
        const step = i + 1;
        const isActive = step <= current;
        return (
          <div
            key={`step-${step}`}
            className={cn(
              'h-0.5 flex-1 rounded-full transition-all duration-300',
              isActive ? 'bg-primary' : 'bg-primary/20',
            )}
          />
        );
      })}
    </div>
  );
}
