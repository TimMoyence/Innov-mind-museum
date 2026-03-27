'use client';

import { type ReactNode, useRef, useState, useCallback } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

interface PhoneMockupProps {
  children: ReactNode;
  className?: string;
  /** Enable subtle parallax on scroll */
  parallax?: boolean;
  /** 'default' = standard, 'floating' = adds shadow + glow */
  variant?: 'default' | 'floating';
  /** Scale multiplier for the phone (default 1) */
  scale?: number;
}

/** iPhone 16 Pro Max proportions: 300px wide, ~652px tall (19.5:9 aspect) */
const PHONE_WIDTH = 300;
const PHONE_HEIGHT = Math.round(PHONE_WIDTH * (19.5 / 9)); // ~652
const BEZEL_WIDTH = 8;
const OUTER_RADIUS = 55;
const INNER_RADIUS = 47;
const DYNAMIC_ISLAND_WIDTH_PCT = 33;

export default function PhoneMockup({
  children,
  className = '',
  parallax = false,
  variant = 'default',
  scale = 1,
}: PhoneMockupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], [40, -40]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const yPos = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({
      rotateY: x * 16, // max +/-8deg
      rotateX: -yPos * 16,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ rotateX: 0, rotateY: 0 });
  }, []);

  const floatingShadow = variant === 'floating'
    ? '0 25px 60px rgba(0, 0, 0, 0.35), 0 10px 20px rgba(0, 0, 0, 0.2)'
    : undefined;

  const content = (
    <div
      className={`relative mx-auto ${className}`}
      style={{
        width: PHONE_WIDTH * scale,
        perspective: 1000,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Floating glow for 'floating' variant */}
      {variant === 'floating' && (
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 50% 60%, rgba(37, 99, 235, 0.15) 0%, transparent 70%)',
            filter: 'blur(30px)',
            transform: 'scale(1.3)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Phone body with 3D tilt */}
      <motion.div
        className="relative z-10"
        style={{
          width: PHONE_WIDTH * scale,
          height: PHONE_HEIGHT * scale,
          borderRadius: OUTER_RADIUS * scale,
          background: 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #111111 100%)',
          padding: BEZEL_WIDTH * scale,
          boxShadow: floatingShadow ?? '0 20px 50px rgba(0, 0, 0, 0.3), 0 8px 16px rgba(0, 0, 0, 0.15)',
          transformStyle: 'preserve-3d',
        }}
        animate={{
          rotateX: tilt.rotateX,
          rotateY: tilt.rotateY,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* Inner screen */}
        <div
          className="relative overflow-hidden"
          style={{
            width: '100%',
            height: '100%',
            borderRadius: INNER_RADIUS * scale,
            background: '#000',
          }}
        >
          {/* Screenshot content fills the full screen */}
          <div className="absolute inset-0">
            {children}
          </div>

          {/* Dynamic Island overlay — rendered OVER the screenshot */}
          <div
            className="absolute left-1/2 z-20"
            style={{
              width: `${DYNAMIC_ISLAND_WIDTH_PCT}%`,
              height: 28 * scale,
              top: 10 * scale,
              transform: 'translateX(-50%)',
              borderRadius: 9999,
              background: '#000',
            }}
            aria-hidden="true"
          />
        </div>

        {/* Glass shine overlay */}
        <div
          className="pointer-events-none absolute inset-0 z-30"
          style={{
            borderRadius: OUTER_RADIUS * scale,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 30%, transparent 55%)',
          }}
          aria-hidden="true"
        />

        {/* Bezel edge highlight (top) */}
        <div
          className="pointer-events-none absolute left-[10%] right-[10%] top-0 z-30 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 30%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.15) 70%, transparent 100%)',
          }}
          aria-hidden="true"
        />
      </motion.div>
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
