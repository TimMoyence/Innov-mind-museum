'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

export default function AnimatedLine() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.8', 'end 0.4'],
  });
  const shouldReduceMotion = useReducedMotion();
  const pathLength = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute left-0 right-0 top-[9.25rem] hidden sm:block"
      aria-hidden="true"
    >
      <svg
        className="h-2 w-full"
        viewBox="0 0 1200 8"
        preserveAspectRatio="none"
        fill="none"
      >
        {/* Connecting line — passes through center of icon boxes (cx=200, 600, 1000) */}
        <motion.line
          x1={200}
          y1={4}
          x2={1000}
          y2={4}
          stroke="rgba(37, 99, 235, 0.4)"
          strokeWidth={2}
          strokeLinecap="round"
          style={shouldReduceMotion ? undefined : { pathLength }}
        />
        {/* Decorative dots at the center of each step icon */}
        {[200, 600, 1000].map((cx) => (
          <circle key={cx} cx={cx} cy={4} r={4} fill="rgba(37, 99, 235, 0.5)" />
        ))}
      </svg>
    </div>
  );
}
