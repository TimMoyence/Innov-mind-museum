'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

const PHONE_WIDTH = 280;
const PHONE_HEIGHT = Math.round(PHONE_WIDTH * (19.5 / 9));
const BEZEL = 7;
const OUTER_R = 50;
const INNER_R = 43;

/**
 * Animated hero iPhone mockup with ambient glow orbs.
 * Framer Motion replacement for the former Remotion HeroComposition.
 *
 * Animations reproduced from the original 300-frame / 30fps loop:
 *  - Entrance spring (scale 0.8→1, opacity 0→1)
 *  - Continuous float Y (±15 px, ~3.3 s period)
 *  - Subtle rotateY drift (±3 deg, ~5 s) + rotateX drift (±2 deg, ~6.7 s)
 *  - 3 ambient orbs with independent drift cycles
 */
export default function HeroAnimation() {
  return (
    <div className="relative w-full" style={{ maxWidth: 500, aspectRatio: '3 / 4' }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* ── Ambient glow orbs ── */}

        {/* Orb 1 — blue, top-left */}
        <motion.div
          animate={{ x: [-30, 30], y: [-20, 20] }}
          transition={{
            x: { repeat: Infinity, repeatType: 'reverse', duration: 6.28, ease: 'easeInOut' },
            y: { repeat: Infinity, repeatType: 'reverse', duration: 7.85, ease: 'easeInOut' },
          }}
          style={{
            position: 'absolute',
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(37, 99, 235, 0.25) 0%, transparent 70%)',
            top: '10%',
            left: '10%',
            filter: 'blur(40px)',
          }}
        />

        {/* Orb 2 — cyan, bottom-right */}
        <motion.div
          animate={{ x: [-25, 25], y: [-30, 30] }}
          transition={{
            x: { repeat: Infinity, repeatType: 'reverse', duration: 5.24, ease: 'easeInOut' },
            y: { repeat: Infinity, repeatType: 'reverse', duration: 6.28, ease: 'easeInOut' },
          }}
          style={{
            position: 'absolute',
            width: 250,
            height: 250,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(56, 189, 248, 0.2) 0%, transparent 70%)',
            bottom: '15%',
            right: '10%',
            filter: 'blur(35px)',
          }}
        />

        {/* Orb 3 — gold, center */}
        <motion.div
          animate={{ x: [-20, 20], y: [-15, 15] }}
          transition={{
            x: { repeat: Infinity, repeatType: 'reverse', duration: 10.47, ease: 'easeInOut' },
            y: { repeat: Infinity, repeatType: 'reverse', duration: 4.49, ease: 'easeInOut' },
          }}
          style={{
            position: 'absolute',
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(212, 168, 83, 0.15) 0%, transparent 70%)',
            top: '50%',
            left: '50%',
            marginTop: -100,
            marginLeft: -100,
            filter: 'blur(30px)',
          }}
        />

        {/* ── Phone mockup ── */}

        {/* Entrance spring */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 80, stiffness: 100, mass: 1 }}
          style={{ perspective: 1000 }}
        >
          {/* Continuous float + rotation */}
          <motion.div
            animate={{ y: [-15, 15], rotateY: [-3, 3], rotateX: [-2, 2] }}
            transition={{
              y: {
                repeat: Infinity,
                repeatType: 'reverse',
                duration: 1.67,
                ease: 'easeInOut',
              },
              rotateY: {
                repeat: Infinity,
                repeatType: 'reverse',
                duration: 2.5,
                ease: 'easeInOut',
              },
              rotateX: {
                repeat: Infinity,
                repeatType: 'reverse',
                duration: 3.33,
                ease: 'easeInOut',
              },
            }}
            style={{
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
                background:
                  'radial-gradient(ellipse 60% 50% at 50% 55%, rgba(37, 99, 235, 0.18) 0%, transparent 65%)',
                filter: 'blur(30px)',
                borderRadius: '50%',
                zIndex: -1,
              }}
            />

            {/* Phone body — titanium bezel */}
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
                <Image
                  src="/images/screenshots/02_home.png"
                  alt="Musaium app home screen"
                  fill
                  style={{ objectFit: 'cover' }}
                  priority
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
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,255,255,0.15) 30%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.15) 70%, transparent)',
                  pointerEvents: 'none',
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
