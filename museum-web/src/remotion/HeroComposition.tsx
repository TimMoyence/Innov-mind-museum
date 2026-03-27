import type React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring, Img } from 'remotion';

/**
 * Remotion Hero composition — 300 frames at 30fps (10-second loop).
 * Shows a floating iPhone mockup with ambient glow orbs.
 *
 * IMPORTANT: This runs inside <Player>. Do NOT use framer-motion, Next.js Image,
 * or any DOM APIs. Only Remotion primitives + CSS transforms.
 */

const PHONE_WIDTH = 280;
const PHONE_HEIGHT = Math.round(PHONE_WIDTH * (19.5 / 9));
const BEZEL = 7;
const OUTER_R = 50;
const INNER_R = 43;

export const HeroComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring — scale from 0.8 to 1, opacity 0 to 1
  const entrance = spring({
    frame,
    fps,
    config: { damping: 80, stiffness: 100, mass: 1 },
  });

  const entryScale = interpolate(entrance, [0, 1], [0.8, 1]);
  const entryOpacity = interpolate(entrance, [0, 1], [0, 1]);

  // Subtle Y-axis float animation (sin wave, +/-15px)
  const floatY = Math.sin((frame / fps) * Math.PI * 0.6) * 15;

  // Very subtle rotation drift
  const rotateY = Math.sin((frame / fps) * Math.PI * 0.4) * 3;
  const rotateX = Math.cos((frame / fps) * Math.PI * 0.3) * 2;

  // Orb animations — gentle drift
  const orb1X = Math.sin((frame / fps) * 0.5) * 30;
  const orb1Y = Math.cos((frame / fps) * 0.4) * 20;
  const orb2X = Math.cos((frame / fps) * 0.6) * 25;
  const orb2Y = Math.sin((frame / fps) * 0.5) * 30;
  const orb3X = Math.sin((frame / fps) * 0.3) * 20;
  const orb3Y = Math.cos((frame / fps) * 0.7) * 15;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: 'transparent',
      }}
    >
      {/* Ambient glow orbs */}
      <div
        style={{
          position: 'absolute',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37, 99, 235, 0.25) 0%, transparent 70%)',
          top: '10%',
          left: '10%',
          filter: 'blur(40px)',
          transform: `translate(${orb1X}px, ${orb1Y}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 250,
          height: 250,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(56, 189, 248, 0.2) 0%, transparent 70%)',
          bottom: '15%',
          right: '10%',
          filter: 'blur(35px)',
          transform: `translate(${orb2X}px, ${orb2Y}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212, 168, 83, 0.15) 0%, transparent 70%)',
          top: '50%',
          left: '50%',
          filter: 'blur(30px)',
          transform: `translate(${orb3X - 100}px, ${orb3Y - 100}px)`,
        }}
      />

      {/* Phone mockup */}
      <div
        style={{
          opacity: entryOpacity,
          transform: `scale(${entryScale}) translateY(${floatY}px) perspective(1000px) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`,
          transformStyle: 'preserve-3d',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Ambient glow behind the device */}
        <div
          style={{
            position: 'absolute',
            inset: '-25%',
            background: 'radial-gradient(ellipse 60% 50% at 50% 55%, rgba(37, 99, 235, 0.18) 0%, transparent 65%)',
            filter: 'blur(30px)',
            borderRadius: '50%',
            zIndex: -1,
          }}
        />

        {/* Phone body - titanium bezel */}
        <div
          style={{
            width: PHONE_WIDTH,
            height: PHONE_HEIGHT,
            borderRadius: OUTER_R,
            background: 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #111 100%)',
            padding: BEZEL,
            boxShadow: '0 25px 60px rgba(0,0,0,0.4), 0 10px 20px rgba(0,0,0,0.2)',
            position: 'relative',
          }}
        >
          {/* Screen */}
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: INNER_R,
              overflow: 'hidden',
              position: 'relative',
              background: '#000',
            }}
          >
            <Img
              src="/images/screenshots/02_home.png"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
            {/* Dynamic Island */}
            <div
              style={{
                position: 'absolute',
                width: '33%',
                height: 26,
                top: 9,
                left: '50%',
                transform: 'translateX(-50%)',
                borderRadius: 9999,
                background: '#000',
                zIndex: 2,
              }}
            />
          </div>

          {/* Glass shine */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: OUTER_R,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 45%)',
              pointerEvents: 'none',
            }}
          />

          {/* Top edge highlight */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '10%',
              right: '10%',
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15) 30%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.15) 70%, transparent)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
    </div>
  );
};
