'use client';

import { type ReactNode, useRef, Children } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

type AnimationVariant = 'slide' | 'scale' | 'fade' | 'blur-scale';

interface AnimatedSectionProps {
  children: ReactNode;
  className?: string;
  /** Delay before animation starts (seconds) */
  delay?: number;
  /** Direction the element slides in from (only used with 'slide' variant) */
  direction?: 'up' | 'down' | 'left' | 'right';
  /** Animation variant: 'slide' (default), 'scale', or 'fade' */
  variant?: AnimationVariant;
  /** When true, staggers children elements */
  stagger?: boolean;
}

const directionOffsets: Record<string, { x: number; y: number }> = {
  up: { x: 0, y: 40 },
  down: { x: 0, y: -40 },
  left: { x: 40, y: 0 },
  right: { x: -40, y: 0 },
};

const springTransition = { type: 'spring' as const, stiffness: 100, damping: 20 };

function getVariants(variant: AnimationVariant, direction: string) {
  switch (variant) {
    case 'blur-scale':
      return {
        hidden: { opacity: 0, scale: 0.95, filter: 'blur(8px)' },
        visible: { opacity: 1, scale: 1, filter: 'blur(0px)' },
      };
    case 'scale':
      return {
        hidden: { opacity: 0, scale: 0.95 },
        visible: { opacity: 1, scale: 1 },
      };
    case 'fade':
      return {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      };
    case 'slide':
    default: {
      const offset = directionOffsets[direction];
      return {
        hidden: { opacity: 0, x: offset.x, y: offset.y },
        visible: { opacity: 1, x: 0, y: 0 },
      };
    }
  }
}

const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const staggerChild = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function AnimatedSection({
  children,
  className = '',
  delay = 0,
  direction = 'up',
  variant = 'slide',
  stagger = false,
}: AnimatedSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div ref={ref} className={className}>{children}</div>;
  }

  if (stagger) {
    return (
      <motion.div
        ref={ref}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        variants={staggerContainer}
        className={className}
        transition={{ delay }}
      >
        {Children.map(children, (child) => (
          <motion.div variants={staggerChild} transition={springTransition}>
            {child}
          </motion.div>
        ))}
      </motion.div>
    );
  }

  const variants = getVariants(variant, direction);

  return (
    <motion.div
      ref={ref}
      initial={variants.hidden}
      animate={isInView ? variants.visible : variants.hidden}
      transition={{ ...springTransition, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
