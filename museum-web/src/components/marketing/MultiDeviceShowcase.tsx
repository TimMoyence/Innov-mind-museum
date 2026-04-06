'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import Image from 'next/image';
import PhoneMockup from '@/components/marketing/PhoneMockup';

const devices = [
  { src: '/images/screenshots/iPhone 16 Pro Max /iPhone 16 Pro Max home.png', alt: 'Musaium on iPhone', scale: 0.75 },
  { src: '/images/screenshots/iPad Pro 13/iPad Pro 13-home.png', alt: 'Musaium on iPad', scale: 1 },
  { src: '/images/screenshots/android/Android - home.png', alt: 'Musaium on Android', scale: 0.75 },
];

export default function MultiDeviceShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const shouldReduceMotion = useReducedMotion();

  return (
    <div ref={ref} className="flex items-end justify-center gap-4 sm:gap-6 lg:gap-8 mt-12">
      {devices.map((device, i) => (
        <motion.div
          key={device.alt}
          className={i !== 1 ? 'hidden sm:block' : undefined}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : undefined}
          transition={{ type: 'spring', stiffness: 100, damping: 20, delay: i * 0.15 }}
        >
          <PhoneMockup scale={device.scale}>
            <Image
              src={device.src}
              alt={device.alt}
              fill
              sizes={device.scale === 1 ? '300px' : '225px'}
              className="object-cover"
              priority={i === 1}
            />
          </PhoneMockup>
        </motion.div>
      ))}
    </div>
  );
}
