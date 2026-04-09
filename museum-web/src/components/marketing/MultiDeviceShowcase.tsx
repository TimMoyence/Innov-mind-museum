'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import PhoneMockup from '@/components/marketing/PhoneMockup';
import TabletMockup from '@/components/marketing/TabletMockup';

/* ── Screenshots: 4 categories × 3 devices ── */
/* NOTE: iPhone folder has a trailing space ("iPhone 16 Pro Max /") and
   Android Dashboard has a double space ("Android -  Dashboard.png").
   Filenames preserved as-is on disk. */
const screenshots = [
  {
    key: 'home',
    label: 'Home',
    iphone: '/images/screenshots/iPhone 16 Pro Max /iPhone 16 Pro Max home.png',
    ipad: '/images/screenshots/iPad Pro 13/iPad Pro 13-home.png',
    android: '/images/screenshots/android/Android - home.png',
  },
  {
    key: 'chat',
    label: 'Chat',
    iphone:
      '/images/screenshots/iPhone 16 Pro Max /iPhone 16 Pro Max - chatSessionWithDiscussion.png',
    ipad: '/images/screenshots/iPad Pro 13/iPad Pro 13 - ChatSessionWithMessages.png',
    android: '/images/screenshots/android/Android - ChatSessionWithMessages.png',
  },
  {
    key: 'map',
    label: 'Map',
    iphone: '/images/screenshots/iPhone 16 Pro Max /iPhone 16 Pro Max -maps.png',
    ipad: '/images/screenshots/iPad Pro 13/iPad Pro 13 - mpas.png',
    android: '/images/screenshots/android/Android - Maps.png',
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    iphone: '/images/screenshots/iPhone 16 Pro Max /iPhone 16 Pro Max - dashboard.png',
    ipad: '/images/screenshots/iPad Pro 13/iPad Pro 13-Dashboard.png',
    android: '/images/screenshots/android/Android -  Dashboard.png',
  },
] as const;

type DeviceType = 'iphone' | 'ipad' | 'android';

const devices: { type: DeviceType; alt: string }[] = [
  { type: 'iphone', alt: 'Musaium on iPhone' },
  { type: 'ipad', alt: 'Musaium on iPad' },
  { type: 'android', alt: 'Musaium on Android' },
];

/* ── 3D arc slot transforms (left, center, right) ── */
const slotTransforms = [
  { rotateY: 28, x: -180, z: -120, scale: 0.78, zIndex: 1 },
  { rotateY: 0, x: 0, z: 0, scale: 1.0, zIndex: 3 },
  { rotateY: -28, x: 180, z: -120, scale: 0.78, zIndex: 1 },
];

const SCREENSHOT_INTERVAL_MS = 4000;
const POSITION_INTERVAL_MS = 8000;

export default function MultiDeviceShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-150px' });
  const shouldReduceMotion = useReducedMotion();
  const [screenshotIndex, setScreenshotIndex] = useState(0);
  const [positionOffset, setPositionOffset] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-rotate screenshots
  useEffect(() => {
    if (shouldReduceMotion || isPaused) {
      return;
    }
    const id = setInterval(() => {
      setScreenshotIndex((prev) => (prev + 1) % screenshots.length);
    }, SCREENSHOT_INTERVAL_MS);
    return () => {
      clearInterval(id);
    };
  }, [shouldReduceMotion, isPaused]);

  // Auto-rotate device positions in the arc
  useEffect(() => {
    if (shouldReduceMotion || isPaused) {
      return;
    }
    const id = setInterval(() => {
      setPositionOffset((prev) => (prev + 1) % devices.length);
    }, POSITION_INTERVAL_MS);
    return () => {
      clearInterval(id);
    };
  }, [shouldReduceMotion, isPaused]);

  return (
    <div
      ref={ref}
      className="mt-12"
      onMouseEnter={() => {
        setIsPaused(true);
      }}
      onMouseLeave={() => {
        setIsPaused(false);
      }}
    >
      {/* Desktop: 3D arc carousel with rotating positions */}
      <div
        className="relative hidden h-[640px] items-center justify-center sm:flex"
        style={{ perspective: 1600 }}
      >
        {devices.map((device, i) => {
          const slot = (i + positionOffset) % devices.length;
          const transform = slotTransforms[slot];
          const isActive = slot === 1;
          const screenshot = screenshots[screenshotIndex];
          const src = screenshot[device.type];

          return (
            <motion.div
              key={device.type}
              className="absolute"
              style={{
                zIndex: transform.zIndex,
                transformStyle: 'preserve-3d',
              }}
              initial={
                shouldReduceMotion
                  ? false
                  : {
                      opacity: 0,
                      scale: 0.6,
                    }
              }
              animate={
                isInView
                  ? {
                      x: transform.x,
                      z: transform.z,
                      rotateY: transform.rotateY,
                      scale: transform.scale,
                      opacity: 1,
                    }
                  : undefined
              }
              transition={{
                type: 'spring',
                stiffness: 60,
                damping: 18,
                mass: 1.2,
              }}
            >
              {device.type === 'ipad' ? (
                <TabletMockup scale={0.75} variant={isActive ? 'floating' : 'default'}>
                  <ScreenshotCrossfade
                    src={src}
                    alt={`${device.alt} — ${screenshot.label}`}
                    activeIndex={screenshotIndex}
                    sizes="285px"
                    priority={i === 1 && screenshotIndex === 0}
                    objectFit="contain"
                  />
                </TabletMockup>
              ) : (
                <PhoneMockup
                  scale={0.85}
                  device={device.type}
                  variant={isActive ? 'floating' : 'default'}
                >
                  <ScreenshotCrossfade
                    src={src}
                    alt={`${device.alt} — ${screenshot.label}`}
                    activeIndex={screenshotIndex}
                    sizes="255px"
                    objectFit="cover"
                  />
                </PhoneMockup>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Mobile: single iPad with screenshot rotation only */}
      <div className="flex items-center justify-center sm:hidden">
        <TabletMockup scale={0.65} variant="floating">
          <ScreenshotCrossfade
            src={screenshots[screenshotIndex].ipad}
            alt={`Musaium on iPad — ${screenshots[screenshotIndex].label}`}
            activeIndex={screenshotIndex}
            sizes="247px"
            priority
            objectFit="contain"
          />
        </TabletMockup>
      </div>

      {/* Dot indicators */}
      <div className="mt-8 flex items-center justify-center gap-2">
        {screenshots.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              setScreenshotIndex(i);
            }}
            aria-label={`Show ${s.label} screen`}
            className="h-2 rounded-full transition-all duration-300"
            style={{
              width: i === screenshotIndex ? 28 : 8,
              backgroundColor:
                i === screenshotIndex ? 'var(--color-primary-500)' : 'var(--fn-input-border)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Crossfade screenshot inside a device frame ── */
function ScreenshotCrossfade({
  src,
  alt,
  activeIndex,
  sizes,
  priority = false,
  objectFit = 'cover',
}: {
  src: string;
  alt: string;
  activeIndex: number;
  sizes: string;
  priority?: boolean;
  objectFit?: 'cover' | 'contain';
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${activeIndex}-${src}`}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className={objectFit === 'contain' ? 'object-contain' : 'object-cover'}
          priority={priority}
        />
      </motion.div>
    </AnimatePresence>
  );
}
