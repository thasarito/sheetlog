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
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
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
