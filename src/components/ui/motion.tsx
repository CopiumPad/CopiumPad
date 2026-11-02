"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

export const TAP = { scale: 0.99 };

const GLOW_REST = "0 0 0 1px rgba(140, 240, 0, 0), 0 0 0px rgba(140, 240, 0, 0)";
const GLOW_HOVER = "0 0 0 1px rgba(140, 240, 0, 0.28), 0 0 24px rgba(140, 240, 0, 0.08)";

/** Pass to a `motion.*` element for the shared border glow. Both states are spread so the shadow interpolates. */
export const HOVER_GLOW = {
  initial: { boxShadow: GLOW_REST },
  whileHover: { boxShadow: GLOW_HOVER },
  transition: { duration: 0.18, ease: "easeOut" },
} as const;

export function MotionCard({ className, ...props }: HTMLMotionProps<"article">) {
  return <motion.article {...HOVER_GLOW} className={className} {...props} />;
}

/** Fixed-height scroller. `layoutScroll` lets layout animations of its children account for scroll offset. */
export function ScrollWindow({ className, ...props }: HTMLMotionProps<"div">) {
  return <motion.div layoutScroll tabIndex={0} className={cn("scroll-window", className)} {...props} />;
}
