'use client';

import { motion, useReducedMotion } from 'framer-motion';

export default function ScrollIndicator() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
      <motion.div
        animate={shouldReduceMotion ? undefined : { y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
        className="flex flex-col items-center gap-2"
      >
        <span className="text-sm text-white/40">Scroll</span>
        <svg
          className="h-5 w-5 text-white/40"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"
          />
        </svg>
      </motion.div>
    </div>
  );
}
