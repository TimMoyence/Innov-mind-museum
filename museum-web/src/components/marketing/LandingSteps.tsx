import AnimatedSection from '@/components/marketing/AnimatedSection';
import AnimatedLine from '@/components/marketing/AnimatedLine';

const stepIcons = [
  <svg
    key="camera"
    className="h-8 w-8 text-primary-400"
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
  </svg>,
  <svg
    key="chat"
    className="h-8 w-8 text-primary-400"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
    />
  </svg>,
  <svg
    key="sparkles"
    className="h-8 w-8 text-primary-400"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
    />
  </svg>,
];

interface LandingStepsProps {
  dict: {
    title: string;
    items: { title: string; description: string }[];
  };
}

export default function LandingSteps({ dict }: LandingStepsProps) {
  return (
    <section id="how-it-works" className="relative overflow-hidden bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AnimatedSection variant="scale">
          <h2
            className="text-center text-3xl font-bold tracking-tight text-text-primary sm:text-4xl lg:text-5xl"
            style={{ letterSpacing: '-0.03em' }}
          >
            {dict.title}
          </h2>
        </AnimatedSection>

        <div className="relative mt-20">
          <AnimatedLine />

          <div className="grid gap-12 sm:grid-cols-3">
            {dict.items.map((item, i) => (
              <AnimatedSection key={i} delay={i * 0.15} variant="scale">
                <div className="flex flex-col items-center text-center">
                  <div className="mb-3 text-xs font-bold text-primary-400">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div
                    className="liquid-glass flex h-20 w-20 items-center justify-center !rounded-3xl"
                    style={{
                      background: 'rgba(255, 255, 255, 0.7)',
                      backdropFilter: 'blur(20px) saturate(1.5)',
                      WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
                    }}
                  >
                    {stepIcons[i]}
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-text-primary">{item.title}</h3>
                  <p className="mt-2 max-w-xs text-text-secondary">{item.description}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
