import Image from 'next/image';
import AnimatedSection from '@/components/marketing/AnimatedSection';
import PhoneMockup from '@/components/marketing/PhoneMockup';

interface LandingAppPreviewProps {
  dict: {
    title: string;
    description: string;
    sectionTitle: string;
  };
}

export default function LandingAppPreview({ dict }: LandingAppPreviewProps) {
  return (
    <section
      className="relative overflow-hidden py-16 sm:py-24"
      style={{
        background:
          'linear-gradient(180deg, var(--color-primary-50) 0%, var(--color-primary-100) 50%, var(--sem-web-auth-gradient) 100%)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.12]" aria-hidden="true">
        <Image
          src="/images/screenshots/02_home.png"
          alt=""
          fill
          className="object-cover blur-[2px]"
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AnimatedSection variant="scale">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.08em] text-primary-600">
              {dict.sectionTitle}
            </p>
            <h2
              className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl lg:text-5xl"
              style={{ letterSpacing: '-0.03em' }}
            >
              {dict.title}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-text-secondary">{dict.description}</p>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.15}>
          <div className="mt-8 flex justify-center gap-3">
            <div
              className="liquid-glass-card flex items-center gap-2 !rounded-full px-5 py-2.5"
              style={{
                background: 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(20px) saturate(1.5)',
              }}
            >
              <svg
                className="h-4 w-4 text-primary-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z"
                />
              </svg>
              <span className="text-sm font-semibold text-text-primary">Discover</span>
            </div>
            <div
              className="liquid-glass-card flex items-center gap-2 !rounded-full px-5 py-2.5"
              style={{
                background: 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(20px) saturate(1.5)',
              }}
            >
              <svg
                className="h-4 w-4 text-primary-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                />
              </svg>
              <span className="text-sm font-semibold text-text-primary">Camera</span>
            </div>
            <div
              className="liquid-glass-card flex items-center gap-2 !rounded-full px-5 py-2.5"
              style={{
                background: 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(20px) saturate(1.5)',
              }}
            >
              <svg
                className="h-4 w-4 text-primary-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                />
              </svg>
              <span className="text-sm font-semibold text-text-primary">Audio</span>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.25} variant="scale">
          <div className="mt-12 flex justify-center">
            <PhoneMockup>
              <Image
                src="/images/screenshots/02_home.png"
                alt="Musaium home screen"
                fill
                sizes="300px"
                style={{ objectFit: 'cover' }}
              />
            </PhoneMockup>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
