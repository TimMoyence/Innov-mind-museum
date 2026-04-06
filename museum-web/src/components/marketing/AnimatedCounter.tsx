'use client';

import { useEffect, useRef } from 'react';
import { useInView, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion';

interface AnimatedCounterProps {
  target: number;
  suffix?: string;
  duration?: number;
}

export default function AnimatedCounter({ target, suffix = '', duration = 2 }: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const shouldReduceMotion = useReducedMotion();
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));

  useEffect(() => {
    if (!isInView || shouldReduceMotion) return;
    const controls = animate(motionValue, target, { duration, ease: 'easeOut' });
    return controls.stop;
  }, [isInView, shouldReduceMotion, motionValue, target, duration]);

  useEffect(() => {
    return rounded.on('change', (v) => {
      if (ref.current) ref.current.textContent = `${v}${suffix}`;
    });
  }, [rounded, suffix]);

  if (shouldReduceMotion) {
    return <span ref={ref}>{target}{suffix}</span>;
  }

  return <span ref={ref}>0{suffix}</span>;
}
