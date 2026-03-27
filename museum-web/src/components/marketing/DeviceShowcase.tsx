'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useInView } from 'framer-motion';
import PhoneMockup from './PhoneMockup';

const devices = [
  {
    src: '/images/screenshots/04_chat.png',
    alt: 'Musaium chat interface',
    scale: 0.75,
    rotateY: 5,
    delay: 0.2,
  },
  {
    src: '/images/screenshots/02_home.png',
    alt: 'Musaium home screen',
    scale: 0.9,
    rotateY: 0,
    delay: 0,
  },
  {
    src: '/images/screenshots/06_settings.png',
    alt: 'Musaium settings',
    scale: 0.75,
    rotateY: -5,
    delay: 0.2,
  },
];

export default function DeviceShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <div
      ref={ref}
      className="flex flex-col items-center gap-8 md:flex-row md:items-center md:justify-center md:gap-6 lg:gap-10"
    >
      {devices.map((device, i) => {
        const isCenter = i === 1;
        return (
          <motion.div
            key={device.src}
            initial={{ opacity: 0, y: 40, rotateY: device.rotateY * 2 }}
            animate={
              isInView
                ? { opacity: 1, y: 0, rotateY: device.rotateY }
                : { opacity: 0, y: 40, rotateY: device.rotateY * 2 }
            }
            transition={{
              type: 'spring',
              stiffness: 80,
              damping: 20,
              delay: device.delay,
            }}
            className={`relative flex-shrink-0 ${isCenter ? 'z-10' : 'z-0 hidden md:block'}`}
            style={{
              perspective: 1000,
            }}
          >
            <PhoneMockup
              variant={isCenter ? 'floating' : 'default'}
              scale={device.scale}
            >
              <Image
                src={device.src}
                alt={device.alt}
                width={300}
                height={652}
                className="h-full w-full object-cover"
              />
            </PhoneMockup>
          </motion.div>
        );
      })}
    </div>
  );
}
