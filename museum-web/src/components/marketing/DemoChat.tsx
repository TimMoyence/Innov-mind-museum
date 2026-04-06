'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import Image from 'next/image';

interface Message {
  role: string;
  text: string;
  image?: string;
}

interface DemoChatProps {
  messages: Message[];
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.4 },
  },
};

const messageVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100, damping: 20 } },
};

export default function DemoChat({ messages }: DemoChatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="flex h-full w-full flex-col bg-gradient-to-b from-[#f0f4ff] to-[#e8f0ff]">
      {/* Header bar */}
      <div className="border-b border-gray-200/50 bg-white/80 px-4 py-3 backdrop-blur-sm">
        <p className="text-sm font-bold text-text-primary">Art Session</p>
      </div>

      {/* Messages area */}
      <div ref={ref} className="flex-1 space-y-3 overflow-hidden px-4 py-3">
        {shouldReduceMotion ? (
          messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            className="space-y-3"
          >
            {messages.map((msg, i) => (
              <motion.div key={i} variants={messageVariants}>
                <MessageBubble message={msg} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={isUser ? 'flex justify-end' : ''}>
      <div
        className={
          isUser
            ? 'max-w-[75%] rounded-2xl rounded-br-md bg-primary-500 px-4 py-2 text-sm text-white'
            : 'max-w-[80%] rounded-2xl rounded-bl-md bg-white px-4 py-2 text-sm text-text-primary shadow-sm'
        }
      >
        <p className={isUser ? '' : 'line-clamp-4'}>{message.text}</p>
        {message.image && (
          <Image
            src={message.image}
            alt=""
            width={200}
            height={150}
            className="mt-2 rounded-lg"
          />
        )}
      </div>
    </div>
  );
}
