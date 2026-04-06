/** A single numbered section within the terms of service document. */
interface TermsSection {
  id: string;
  title: string;
  paragraphs: string[];
}

/** Structured content of the terms of service, rendered in the legal screen. */
interface TermsOfServiceContent {
  title: string;
  version: string;
  lastUpdated: string;
  sections: TermsSection[];
}

/** Complete terms of service content for the Musaium app, structured for in-app rendering. */
export const TERMS_OF_SERVICE_CONTENT: TermsOfServiceContent = {
  title: 'Terms of Service',
  version: '1.0.0',
  lastUpdated: '2026-03-18',
  sections: [
    {
      id: 'acceptance',
      title: '1. Acceptance of Terms',
      paragraphs: [
        'By creating an account or using Musaium, you agree to these Terms of Service. If you do not agree, do not use the app.',
      ],
    },
    {
      id: 'description',
      title: '2. Description of Service',
      paragraphs: [
        'Musaium is an AI-powered museum assistant that provides contextual information about artworks, monuments, and cultural heritage. The service is provided "as is" without guarantees of accuracy or availability.',
        'AI-generated responses are for informational and educational purposes only. They may contain inaccuracies and should not be considered authoritative.',
      ],
    },
    {
      id: 'accounts',
      title: '3. User Accounts',
      paragraphs: [
        'You must provide accurate information when creating an account. You are responsible for maintaining the security of your credentials.',
        "You may sign in with email/password, Apple Sign-In, or Google Sign-In. Social sign-in accounts are subject to the respective provider's terms.",
        'You may delete your account at any time from the Settings screen. Deletion is immediate and permanent.',
      ],
    },
    {
      id: 'acceptable-use',
      title: '4. Acceptable Use',
      paragraphs: [
        "You agree not to use Musaium to: submit offensive, abusive, or illegal content; attempt to bypass content filters or safety guardrails; reverse-engineer the service; or access other users' data.",
        'We reserve the right to suspend or terminate accounts that violate these terms.',
      ],
    },
    {
      id: 'intellectual-property',
      title: '5. Intellectual Property',
      paragraphs: [
        'Musaium and its content, features, and functionality are owned by InnovMind. The AI-generated responses do not confer any intellectual property rights to users.',
        'Images you upload remain your property. By uploading, you grant Musaium a limited license to process them for the purpose of providing the service.',
      ],
    },
    {
      id: 'limitation-liability',
      title: '6. Limitation of Liability',
      paragraphs: [
        'To the maximum extent permitted by law, InnovMind shall not be liable for any indirect, incidental, or consequential damages arising from your use of Musaium.',
        'The service is provided for informational purposes. We do not guarantee the accuracy, completeness, or reliability of AI-generated content.',
      ],
    },
    {
      id: 'privacy',
      title: '7. Privacy',
      paragraphs: [
        'Your use of Musaium is also governed by our Privacy Policy, which describes how we collect, use, and protect your data.',
      ],
    },
    {
      id: 'modifications',
      title: '8. Modifications',
      paragraphs: [
        'We may update these terms from time to time. Material changes will be communicated in-app. Continued use after changes constitutes acceptance.',
      ],
    },
    {
      id: 'governing-law',
      title: '9. Governing Law',
      paragraphs: [
        'These terms are governed by the laws of France. Any disputes shall be resolved in the courts of competent jurisdiction in France.',
      ],
    },
    {
      id: 'contact',
      title: '10. Contact',
      paragraphs: ['For questions about these terms, contact: tim.moyence@gmail.com.'],
    },
  ],
};
