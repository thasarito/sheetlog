import React from "react";
import { Check } from "lucide-react";
import { ScreenFrame } from "./ScreenFrame";
import type { ScreenMeta } from "./types";

type DoneScreenProps = {
  meta: ScreenMeta;
};

export function DoneScreen({ meta }: DoneScreenProps) {
  return (
    <ScreenFrame
      {...meta}
      title="All set"
      subtitle="You're ready to log your first transaction."
      icon={<Check className="h-5 w-5" />}
    >
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Check className="h-7 w-7" />
        </div>
        <p className="text-sm text-muted-foreground">
          You can start logging now.
        </p>
      </div>
    </ScreenFrame>
  );
}
