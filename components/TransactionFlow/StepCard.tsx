"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";

type StepCardProps = {
  stepIndex: number;
  totalSteps: number;
  label: string;
  animationKey: string;
  className: string;
  children: React.ReactNode;
};

export function StepCard({
  stepIndex,
  totalSteps,
  label,
  animationKey,
  className,
  children,
}: StepCardProps) {
  return (
    <section className="rounded-[28px] border border-border/70 bg-card/90 p-5 shadow-soft backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <span>
          Step {stepIndex + 1} of {totalSteps}
        </span>
        <span>{label}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={animationKey}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.2 }}
          className={className}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
