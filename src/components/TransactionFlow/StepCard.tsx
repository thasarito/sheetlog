import React from "react";
import { AnimatePresence, motion } from "framer-motion";

type StepCardProps = {
  animationKey: string;
  className: string;
  containerClassName?: string;
  children: React.ReactNode;
};

export function StepCard({
  animationKey,
  className,
  containerClassName,
  children,
}: StepCardProps) {
  return (
    <section
      className={["rounded-[28px]", containerClassName]
        .filter(Boolean)
        .join(" ")}
    >
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
