export interface PrivacyPolicySection {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface PrivacyPolicyContent {
  title: string;
  version: string;
  lastUpdated: string;
  controllerName: string;
  controllerAddress: string;
  contactEmail: string;
  dpoContact: string;
  rightsSummary: string[];
  quickFacts: Array<{ label: string; value: string }>;
  releaseChecklist: string[];
  sections: PrivacyPolicySection[];
}

export const PRIVACY_POLICY_CONTENT: PrivacyPolicyContent = {
  title: 'Privacy Policy (GDPR / RGPD)',
  version: '1.0.0-draft',
  lastUpdated: '2026-02-22',
  controllerName: 'TO_FILL_CONTROLLER_NAME',
  controllerAddress: 'TO_FILL_CONTROLLER_ADDRESS',
  contactEmail: 'TO_FILL_PRIVACY_EMAIL',
  dpoContact: 'Not designated yet (TO_FILL_DPO_CONTACT_OR_NA)',
  rightsSummary: [
    'Access your data',
    'Correct inaccurate data',
    'Request deletion where applicable',
    'Restrict processing in specific cases',
    'Portability for eligible data',
    'Object to processing based on legitimate interests',
    'Withdraw consent for permission-based processing',
  ],
  quickFacts: [
    { label: 'Scope', value: 'Musaium mobile app + related support channels' },
    { label: 'Data types', value: 'Account, chat, image upload, voice upload, diagnostics' },
    { label: 'Permissions', value: 'Camera / microphone only on explicit user action' },
    { label: 'User rights', value: 'GDPR rights available via privacy contact / support' },
  ],
  releaseChecklist: [
    'Replace controller legal name and registered address',
    'Set privacy contact email and DPO contact (or explicitly state N/A legally)',
    'List current processors and international transfer safeguards',
    'Define retention periods for account, chat, logs, images, and audio',
    'Specify supervisory authority and complaint contact details',
    'Validate wording with legal counsel before public store release',
  ],
  sections: [
    {
      id: 'controller',
      title: '1. Data Controller',
      paragraphs: [
        'Musaium is operated by TO_FILL_CONTROLLER_NAME, acting as data controller for personal data processed through the mobile application and related support channels.',
        'Registered address: TO_FILL_CONTROLLER_ADDRESS.',
      ],
    },
    {
      id: 'data-collected',
      title: '2. Data We Collect',
      paragraphs: [
        'Account data: email address, authentication identifiers, and account status metadata.',
        'Usage data: chat prompts, uploaded images, voice messages submitted for transcription, timestamps, device/runtime metadata, and app diagnostics required for support.',
        'Support data: messages sent through support channels (Instagram/Telegram) may be processed by those platforms under their own privacy policies.',
      ],
    },
    {
      id: 'purposes',
      title: '3. Purposes of Processing',
      paragraphs: [
        'Provide museum-focused AI assistance about artworks, monuments, museums, architecture, and cultural heritage.',
        'Operate authentication, secure sessions, error handling, and support workflows.',
        'Improve service quality, monitor abuse/guardrails, and maintain security and reliability.',
      ],
    },
    {
      id: 'legal-basis',
      title: '4. Legal Bases (GDPR Art. 6)',
      paragraphs: [
        'Contract performance (Art. 6(1)(b)) for account access and core app functionality.',
        'Legitimate interests (Art. 6(1)(f)) for security monitoring, fraud prevention, service reliability, and product diagnostics.',
        'Consent (Art. 6(1)(a)) for device permissions such as camera/microphone when required by the platform and only when the user explicitly triggers those features.',
      ],
    },
    {
      id: 'recipients',
      title: '5. Recipients / Processors',
      paragraphs: [
        'Authorized internal personnel on a need-to-know basis.',
        'Hosting, infrastructure, analytics, and AI processing providers used to operate Musaium (TO_FILL_PROCESSOR_LIST).',
        'Payment providers are TO_FILL_IF_APPLICABLE.',
      ],
    },
    {
      id: 'transfers',
      title: '6. International Transfers',
      paragraphs: [
        'Some processors may process data outside the EEA/UK/Switzerland. Where applicable, transfers are governed by appropriate safeguards such as SCCs, adequacy decisions, or equivalent mechanisms.',
        'Transfer details for current processors: TO_FILL_TRANSFER_DETAILS.',
      ],
    },
    {
      id: 'retention',
      title: '7. Retention Periods',
      paragraphs: [
        'Account and session data are retained for TO_FILL_RETENTION_ACCOUNT_DATA unless deletion is requested and no legal retention obligation applies.',
        'Support diagnostics and incident logs are retained for TO_FILL_RETENTION_LOGS.',
        'Voice/image uploads may be retained only as needed to provide the service and maintain security, subject to TO_FILL_RETENTION_MEDIA_POLICY.',
      ],
    },
    {
      id: 'security',
      title: '8. Security Measures',
      paragraphs: [
        'Musaium uses technical and organizational safeguards such as access controls, transport security, environment isolation, and operational monitoring. No system is risk-free, and users should avoid sharing unnecessary sensitive data.',
      ],
    },
    {
      id: 'rights',
      title: '9. Your GDPR Rights',
      paragraphs: [
        'You may request access, rectification, erasure, restriction, portability, and objection to processing where applicable.',
        'Where processing is based on consent, you may withdraw consent at any time without affecting processing before withdrawal.',
      ],
    },
    {
      id: 'exercise-rights',
      title: '10. Exercising Rights / Complaints',
      paragraphs: [
        'To exercise your rights, contact: TO_FILL_PRIVACY_EMAIL and include enough information to verify your request.',
        'You may also lodge a complaint with your local supervisory authority. Lead authority (if applicable): TO_FILL_SUPERVISORY_AUTHORITY.',
      ],
    },
    {
      id: 'minors',
      title: '11. Children / Minors',
      paragraphs: [
        'Musaium is not intended for children below the age required under applicable law without parental authorization. If you believe a minor provided data unlawfully, contact TO_FILL_PRIVACY_EMAIL.',
      ],
    },
    {
      id: 'changes',
      title: '12. Policy Changes',
      paragraphs: [
        'We may update this policy to reflect legal, technical, or product changes. Material changes will be communicated in-app or through appropriate channels before or when they take effect.',
      ],
    },
  ],
};

export const isPrivacyPlaceholderValue = (value: string): boolean => {
  return value.includes('TO_FILL_');
};
