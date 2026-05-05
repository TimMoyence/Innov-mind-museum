import ShowcaseSection from '@/components/marketing/ShowcaseSection';
import PhoneMockup from '@/components/marketing/PhoneMockup';
import DemoChat from '@/components/marketing/DemoChat';

interface LandingChatShowcaseProps {
  dict: {
    title: string;
    subtitle: string;
    bullets: string[];
    messages: { role: string; text: string }[];
  };
}

export default function LandingChatShowcase({ dict }: LandingChatShowcaseProps) {
  return (
    <ShowcaseSection title={dict.title} subtitle={dict.subtitle} bullets={dict.bullets} theme="dark">
      <PhoneMockup variant="floating">
        <DemoChat messages={dict.messages} />
      </PhoneMockup>
    </ShowcaseSection>
  );
}
