'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

interface Message {
  role: string;
  text: string;
}

interface DemoChatProps {
  messages: Message[];
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.5 } },
};

const messageVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 120, damping: 20 },
  },
};

export default function DemoChat({ messages }: DemoChatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-150px' });
  const shouldReduceMotion = useReducedMotion();

  const renderMessages = (msgs: Message[]) =>
    msgs.map((msg, i) => <MessageBubble key={i} message={msg} isLast={i === msgs.length - 1} />);

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{
        background:
          'linear-gradient(180deg, var(--color-primary-50) 0%, var(--color-primary-100) 100%)',
      }}
    >
      {/* Header — glass card (matches Expo ChatHeader) */}
      <div
        className="flex items-center justify-between px-3.5 py-3"
        style={{
          background: 'var(--fn-assistant-bubble)',
          backdropFilter: 'blur(24px) saturate(1.5)',
          borderBottom: '1px solid var(--fn-assistant-bubble-border)',
        }}
      >
        <div>
          <p
            className="text-base font-bold"
            style={{ color: 'var(--color-text-primary)', fontSize: 'var(--font-size-lg)' }}
          >
            Art Session
          </p>
          <p className="mt-0.5" style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs-)' }}>
            a213b2e3-e00...
          </p>
        </div>
        <div className="flex gap-2">
          {/* Header action buttons (decorative) */}
          {[headsetIcon, docIcon, closeIcon].map((icon, i) => (
            <div
              key={i}
              className="flex items-center justify-center"
              style={{
                width: 'var(--sem-media-avatar-small)',
                height: 'var(--sem-media-avatar-small)',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--fn-input-border)',
                background: 'var(--fn-surface)',
              }}
            >
              {icon}
            </div>
          ))}
        </div>
      </div>

      {/* Messages area */}
      <div ref={ref} className="flex-1 overflow-hidden px-2.5 py-2.5" style={{ gap: 10 }}>
        {shouldReduceMotion ? (
          <div className="flex flex-col gap-2.5">{renderMessages(messages)}</div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            className="flex flex-col gap-2.5"
          >
            {messages.map((msg, i) => (
              <motion.div key={i} variants={messageVariants}>
                <MessageBubble message={msg} isLast={i === messages.length - 1} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Attachment buttons — Gallery, Camera, Audio (matches Expo MediaAttachmentPanel) */}
      <div className="flex gap-2 px-2.5 pb-1">
        {attachmentButtons.map((btn) => (
          <div
            key={btn.label}
            className="flex items-center gap-1.5"
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--fn-assistant-bubble-border)',
              background: 'var(--fn-surface)',
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
            }}
          >
            {btn.icon}
            <span>{btn.label}</span>
          </div>
        ))}
      </div>

      {/* Input bar — glass card (matches Expo ChatInput) */}
      <div
        className="flex items-end gap-2 px-2.5 py-2"
        style={{
          background: 'var(--fn-assistant-bubble)',
          backdropFilter: 'blur(24px) saturate(1.5)',
        }}
      >
        <div
          className="flex-1"
          style={{
            minHeight: 'var(--sem-media-avatar-medium)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--fn-input-border)',
            background: 'var(--fn-input-background)',
            padding: '7px 10px',
            fontSize: 11,
            color: 'var(--color-text-secondary)',
          }}
        >
          Ask about an artwork, monument, or send voice/photo...
        </div>
        <div
          className="flex shrink-0 items-center justify-center"
          style={{
            width: 'var(--sem-media-avatar-medium)',
            height: 'var(--sem-media-avatar-medium)',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-primary-600)',
          }}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ── Message Bubble ── */

function MessageBubble({ message, isLast }: { message: Message; isLast: boolean }) {
  const isUser = message.role === 'user';

  return (
    <div className={isUser ? 'flex justify-end' : ''}>
      <div
        style={{
          maxWidth: '85%',
          borderRadius: 'var(--radius-2xl)',
          padding: 'var(--spacing-3)',
          border: `1px solid ${isUser ? 'var(--fn-user-bubble-border)' : 'var(--fn-assistant-bubble-border)'}`,
          background: isUser ? 'var(--fn-user-bubble)' : 'var(--fn-assistant-bubble)',
          color: isUser ? 'var(--color-surface)' : 'var(--color-text-primary)',
          fontSize: 'var(--font-size-xs)',
          lineHeight: '17px',
        }}
      >
        <p>{message.text}</p>
      </div>
      {/* Meta row — timestamp + actions (assistant only) */}
      {!isUser && (
        <div
          className="mt-1 flex items-center gap-2.5"
          style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fn-timestamp)' }}
        >
          <span>21:35</span>
          <span className="flex items-center gap-0.5">
            <ThumbIcon /> <ThumbIcon down />
          </span>
          <span className="flex items-center gap-0.5">{volumeIcon} Listen</span>
          <span className="flex items-center gap-0.5">{flagIcon} Report</span>
          {isLast && (
            <span className="ml-auto" style={{ color: 'var(--color-primary-600)' }}>
              Share
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Tiny SVG icons (matching Expo Ionicons) ── */

function ThumbIcon({ down }: { down?: boolean }) {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={down ? { transform: 'scaleY(-1)' } : undefined}
    >
      <path d="M7 22V11L2 13V22H7ZM7 11L11.5 2C12.3 2 14 2.5 14 5V8H19.5C20.9 8 22 9.3 21.7 10.7L19.7 20.7C19.5 21.5 18.8 22 18 22H7" />
    </svg>
  );
}

const volumeIcon = (
  <svg
    width={10}
    height={10}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 5L6 9H2V15H6L11 19V5Z" />
    <path d="M15.5 8.5C16.5 9.5 17 11 17 12.5C17 14 16.5 15 15.5 16" />
  </svg>
);

const flagIcon = (
  <svg
    width={10}
    height={10}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1={4} y1={22} x2={4} y2={15} />
  </svg>
);

const headsetIcon = (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--color-text-secondary)"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 18v-6a9 9 0 0118 0v6" />
    <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z" />
  </svg>
);

const docIcon = (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--color-primary-600)"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6" />
    <line x1={16} y1={13} x2={8} y2={13} />
    <line x1={16} y1={17} x2={8} y2={17} />
  </svg>
);

const closeIcon = (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--color-text-primary)"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1={18} y1={6} x2={6} y2={18} />
    <line x1={6} y1={6} x2={18} y2={18} />
  </svg>
);

const attachmentButtons = [
  {
    label: 'Gallery',
    icon: (
      <svg
        width={12}
        height={12}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x={3} y={3} width={18} height={18} rx={2} ry={2} />
        <circle cx={8.5} cy={8.5} r={1.5} />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    ),
  },
  {
    label: 'Camera',
    icon: (
      <svg
        width={12}
        height={12}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
        <circle cx={12} cy={13} r={4} />
      </svg>
    ),
  },
  {
    label: 'Audio',
    icon: (
      <svg
        width={12}
        height={12}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
        <path d="M19 10v2a7 7 0 01-14 0v-2" />
        <line x1={12} y1={19} x2={12} y2={23} />
      </svg>
    ),
  },
];
