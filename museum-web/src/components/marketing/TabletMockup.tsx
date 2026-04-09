'use client';

import { type ReactNode, useRef, useState, useCallback } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

interface TabletMockupProps {
  children: ReactNode;
  className?: string;
  /** Enable subtle parallax on scroll */
  parallax?: boolean;
  /** 'default' = standard, 'floating' = adds shadow + glow */
  variant?: 'default' | 'floating';
  /** Scale multiplier for the tablet (default 1) */
  scale?: number;
  /** Show iOS-style status bar overlay */
  showStatusBar?: boolean;
}

/** iPad Pro 13" portrait proportions: 380px wide, ~507px tall (3:4 aspect) */
const TABLET_WIDTH = 380;
const TABLET_HEIGHT = Math.round(TABLET_WIDTH * (4 / 3)); // ~507
const BEZEL_WIDTH = 11;
const OUTER_RADIUS = 32;
const INNER_RADIUS = 22;

export default function TabletMockup({
  children,
  className = '',
  parallax = false,
  variant = 'default',
  scale = 1,
  showStatusBar = true,
}: TabletMockupProps) {
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
      rotateY: x * 12, // gentler tilt for tablet
      rotateX: -yPos * 12,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ rotateX: 0, rotateY: 0 });
  }, []);

  const floatingShadow =
    variant === 'floating'
      ? '0 30px 70px rgba(0, 0, 0, 0.35), 0 12px 24px rgba(0, 0, 0, 0.2)'
      : undefined;

  const content = (
    <div
      className={`relative mx-auto ${className}`}
      style={{
        width: TABLET_WIDTH * scale,
        maxWidth: '100%',
        perspective: 1200,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Floating glow */}
      {variant === 'floating' && (
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 50% at 50% 60%, var(--fn-primary-glow-medium) 0%, transparent 70%)',
            filter: 'blur(36px)',
            transform: 'scale(1.3)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Tablet body */}
      <motion.div
        className="relative z-10"
        style={{
          width: TABLET_WIDTH * scale,
          height: TABLET_HEIGHT * scale,
          maxWidth: '100%',
          borderRadius: OUTER_RADIUS * scale,
          background: 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #111111 100%)',
          padding: BEZEL_WIDTH * scale,
          boxShadow:
            floatingShadow ?? '0 24px 60px rgba(0, 0, 0, 0.3), 0 10px 20px rgba(0, 0, 0, 0.15)',
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
          {/* Screenshot content */}
          <div className="absolute inset-0">{children}</div>

          {/* iPad status bar (no Dynamic Island, just time + icons) */}
          {showStatusBar && <TabletStatusBar scale={scale} />}

          {/* Front camera dot — centered top */}
          <div
            className="absolute left-1/2 z-20"
            style={{
              width: 5 * scale,
              height: 5 * scale,
              top: 4 * scale,
              transform: 'translateX(-50%)',
              borderRadius: 9999,
              background: '#0a0a0a',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
            }}
            aria-hidden="true"
          />
        </div>

        {/* Glass shine overlay */}
        <div
          className="pointer-events-none absolute inset-0 z-30"
          style={{
            borderRadius: OUTER_RADIUS * scale,
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 30%, transparent 55%)',
          }}
          aria-hidden="true"
        />

        {/* Bezel edge highlight */}
        <div
          className="pointer-events-none absolute left-[10%] right-[10%] top-0 z-30 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 30%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.15) 70%, transparent 100%)',
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

/* ── iPad Status Bar overlay ── */

function TabletStatusBar({ scale }: { scale: number }) {
  const fontSize = 12 * scale;
  const iconHeight = 10 * scale;
  const topPosition = 10 * scale;
  const sidePadding = 18 * scale;
  const textShadow = '0 0 4px rgba(0,0,0,0.4)';

  return (
    <>
      {/* Left: time */}
      <div
        className="absolute z-20"
        style={{
          top: topPosition,
          left: sidePadding,
          fontSize,
          fontWeight: 600,
          color: 'var(--color-surface)',
          textShadow,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
        aria-hidden="true"
      >
        9:41
      </div>

      {/* Right: wifi + battery (no signal bars on iPad WiFi) */}
      <div
        className="absolute z-20 flex items-center"
        style={{
          top: topPosition + 1,
          right: sidePadding,
          gap: 5 * scale,
          color: 'var(--color-surface)',
          filter: `drop-shadow(${textShadow})`,
        }}
        aria-hidden="true"
      >
        {/* Wifi */}
        <svg
          width={iconHeight + 4}
          height={iconHeight}
          viewBox="0 0 16 12"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
        >
          <path d="M2 5 Q8 0 14 5" />
          <path d="M4 7.5 Q8 4 12 7.5" />
          <path d="M6 10 Q8 8.5 10 10" />
          <circle cx={8} cy={11} r={0.6} fill="currentColor" />
        </svg>

        {/* Battery */}
        <svg width={iconHeight + 13} height={iconHeight} viewBox="0 0 25 12" fill="none">
          <rect
            x={0.6}
            y={0.6}
            width={21}
            height={10.8}
            rx={2.6}
            stroke="currentColor"
            strokeOpacity={0.65}
            strokeWidth={1}
          />
          <rect x={2} y={2} width={18} height={8} rx={1.6} fill="currentColor" />
          <rect
            x={22.4}
            y={4}
            width={1.6}
            height={4}
            rx={0.6}
            fill="currentColor"
            fillOpacity={0.65}
          />
        </svg>
      </div>
    </>
  );
}
