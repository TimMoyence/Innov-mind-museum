'use client';

import { type ReactNode, useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

interface PhoneMockupProps {
  children: ReactNode;
  className?: string;
  /** Enable subtle parallax on scroll */
  parallax?: boolean;
}

export default function PhoneMockup({
  children,
  className = '',
  parallax = false,
}: PhoneMockupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], [40, -40]);

  const content = (
    <div
      className={`relative mx-auto w-[280px] sm:w-[300px] ${className}`}
    >
      {/* Phone outer frame */}
      <div className="rounded-[2.5rem] border-[6px] border-primary-900 bg-primary-900 p-1.5 shadow-2xl">
        {/* Notch */}
        <div className="absolute left-1/2 top-2 z-10 h-6 w-24 -translate-x-1/2 rounded-b-2xl bg-primary-900" />
        {/* Screen */}
        <div className="relative overflow-hidden rounded-[2rem] bg-white">
          {children}
        </div>
      </div>
      {/* Reflection highlight */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[2.5rem]"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%)',
        }}
        aria-hidden="true"
      />
    </div>
  );

  if (parallax) {
    return (
      <motion.div ref={ref} style={{ y }}>
        {content}
      </motion.div>
    );
  }

  return <div ref={ref}>{content}</div>;
}
