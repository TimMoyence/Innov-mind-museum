'use client';

import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

export default function HeroOrbs() {
  const { scrollYProgress } = useScroll();
  const shouldReduceMotion = useReducedMotion();

  const slowY = useTransform(scrollYProgress, [0, 0.3], ['0%', '15%']);
  const midY = useTransform(scrollYProgress, [0, 0.3], ['0%', '25%']);
  const fastY = useTransform(scrollYProgress, [0, 0.3], ['0%', '40%']);

  const style = (y: typeof slowY) =>
    shouldReduceMotion ? undefined : { y };

  return (
    <>
      <motion.div
        className="pointer-events-none absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-primary-500/15 blur-3xl orb"
        style={style(slowY)}
        aria-hidden="true"
      />
      <motion.div
        className="pointer-events-none absolute -right-32 top-1/4 h-[400px] w-[400px] rounded-full bg-accent-400/10 blur-3xl orb orb-delay-1"
        style={style(midY)}
        aria-hidden="true"
      />
      <motion.div
        className="pointer-events-none absolute bottom-20 left-1/3 h-[350px] w-[500px] rounded-full bg-gold-400/8 blur-3xl orb orb-delay-2"
        style={style(fastY)}
        aria-hidden="true"
      />
      <motion.div
        className="pointer-events-none absolute right-1/4 top-1/2 h-[300px] w-[300px] rounded-full bg-purple-500/8 blur-3xl orb orb-delay-3"
        style={style(midY)}
        aria-hidden="true"
      />
    </>
  );
}
