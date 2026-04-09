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
  /** Device camera style: 'iphone' = Dynamic Island, 'android' = hole-punch */
  device?: 'iphone' | 'android';
  /** Show iOS-style status bar overlay (time + signal/wifi/battery) */
  showStatusBar?: boolean;
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
  device = 'iphone',
  showStatusBar = true,
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

  const floatingShadow =
    variant === 'floating'
      ? '0 25px 60px rgba(0, 0, 0, 0.35), 0 10px 20px rgba(0, 0, 0, 0.2)'
      : undefined;

  const content = (
    <div
      className={`relative mx-auto ${className}`}
      style={{
        width: PHONE_WIDTH * scale,
        maxWidth: '100%',
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
            background:
              'radial-gradient(ellipse 70% 50% at 50% 60%, var(--fn-primary-glow-medium) 0%, transparent 70%)',
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
          maxWidth: '100%',
          borderRadius: OUTER_RADIUS * scale,
          background: 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #111111 100%)',
          padding: BEZEL_WIDTH * scale,
          boxShadow:
            floatingShadow ?? '0 20px 50px rgba(0, 0, 0, 0.3), 0 8px 16px rgba(0, 0, 0, 0.15)',
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
          <div className="absolute inset-0">{children}</div>

          {/* iOS Status Bar overlay (above the camera notch) */}
          {showStatusBar && <StatusBar scale={scale} />}

          {/* Camera notch — Dynamic Island (iPhone) or hole-punch (Android) */}
          {device === 'iphone' ? (
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
          ) : (
            <div
              className="absolute left-1/2 z-20"
              style={{
                width: 14 * scale,
                height: 14 * scale,
                top: 12 * scale,
                transform: 'translateX(-50%)',
                borderRadius: 9999,
                background: '#000',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)',
              }}
              aria-hidden="true"
            />
          )}
        </div>

        {/* Glass shine overlay */}
        <div
          className="pointer-events-none absolute inset-0 z-30"
          style={{
            borderRadius: OUTER_RADIUS * scale,
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 30%, transparent 55%)',
          }}
          aria-hidden="true"
        />

        {/* Bezel edge highlight (top) */}
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

/* ── iOS Status Bar overlay ── */

function StatusBar({ scale }: { scale: number }) {
  const fontSize = 13 * scale;
  const iconHeight = 11 * scale;
  const topPosition = 14 * scale;
  const sidePadding = 22 * scale;
  const textShadow = '0 0 4px rgba(0,0,0,0.4)';

  return (
    <>
      {/* Left: time (Apple's canonical 9:41) */}
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

      {/* Right: signal + wifi + battery */}
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
        {/* Signal — 4 bars */}
        <svg width={iconHeight + 6} height={iconHeight} viewBox="0 0 18 12" fill="currentColor">
          <rect x={0} y={8} width={3} height={4} rx={0.5} />
          <rect x={5} y={5} width={3} height={7} rx={0.5} />
          <rect x={10} y={2} width={3} height={10} rx={0.5} />
          <rect x={15} y={0} width={3} height={12} rx={0.5} />
        </svg>

        {/* Wifi — 3 arcs + dot */}
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

        {/* Battery — outline + fill + nub */}
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
