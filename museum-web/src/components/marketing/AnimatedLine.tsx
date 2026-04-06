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
      className="absolute left-0 right-0 top-10 hidden sm:block"
      aria-hidden="true"
    >
      <svg
        className="h-px w-full"
        viewBox="0 0 1000 2"
        preserveAspectRatio="none"
        fill="none"
      >
        <motion.line
          x1={50}
          y1={1}
          x2={950}
          y2={1}
          stroke="rgba(37, 99, 235, 0.4)"
          strokeWidth={2}
          style={shouldReduceMotion ? undefined : { pathLength }}
        />
      </svg>
    </div>
  );
}
