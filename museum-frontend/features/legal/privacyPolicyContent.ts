/** A single numbered section within the privacy policy document. */
export interface PrivacyPolicySection {
  id: string;
  title: string;
  paragraphs: string[];
}

/** Structured content of the full GDPR-compliant privacy policy, rendered in the legal screen. */
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

/** Complete privacy policy content for the Musaium app, structured for in-app rendering. */
export const PRIVACY_POLICY_CONTENT: PrivacyPolicyContent = {
  title: 'Privacy Policy (GDPR / RGPD)',
  version: '1.0.0',
  lastUpdated: '2026-03-18',
  controllerName: 'InnovMind (Tim Moyence, Entrepreneur Individuel)',
  controllerAddress: 'France',
  contactEmail: 'tim.moyence@gmail.com',
  dpoContact: 'Non désigné (non requis au titre de l\'article 37 du RGPD)',
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
  releaseChecklist: [],
  sections: [
    {
      id: 'controller',
      title: '1. Data Controller',
      paragraphs: [
        'Musaium is operated by InnovMind (Tim Moyence, Entrepreneur Individuel), acting as data controller for personal data processed through the mobile application and related support channels.',
        'Registered address: France.',
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
        'Personnel interne autorisé, sur la base du besoin d\'en connaître.',
        'Sous-traitants : OpenAI (États-Unis), Google Cloud (États-Unis/UE), DeepSeek (Chine), OVH SAS (France, données UE), Amazon Web Services (UE, données UE), Expo/EAS (États-Unis).',
        'Aucun prestataire de paiement n\'est utilisé à ce jour.',
      ],
    },
    {
      id: 'transfers',
      title: '6. International Transfers',
      paragraphs: [
        'Some processors may process data outside the EEA/UK/Switzerland. Where applicable, transfers are governed by appropriate safeguards such as SCCs, adequacy decisions, or equivalent mechanisms.',
        'Les transferts vers les États-Unis sont encadrés par les conditions d\'utilisation des fournisseurs concernés. Les données hébergées chez OVH et AWS restent dans l\'Union européenne.',
      ],
    },
    {
      id: 'retention',
      title: '7. Retention Periods',
      paragraphs: [
        'Données de compte, historique de conversations et images : conservés pendant la durée d\'utilisation du service, supprimés sur demande.',
        'Fichiers audio (questions vocales) : non stockés — transmis pour transcription puis immédiatement supprimés.',
        'Jetons d\'authentification : accès 15 minutes, renouvellement 30 jours.',
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
        'To exercise your rights, contact: tim.moyence@gmail.com and include enough information to verify your request.',
        'You may also lodge a complaint with your local supervisory authority. Lead authority (if applicable): la CNIL (Commission Nationale de l\'Informatique et des Libertés), 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07.',
      ],
    },
    {
      id: 'minors',
      title: '11. Children / Minors',
      paragraphs: [
        'Musaium is not intended for children below the age required under applicable law without parental authorization. If you believe a minor provided data unlawfully, contact tim.moyence@gmail.com.',
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

/**
 * Checks whether a string contains a placeholder marker that must be replaced before release.
 * @param value - String to inspect.
 * @returns `true` if the value contains `'TO_FILL_'`.
 */
export const isPrivacyPlaceholderValue = (value: string): boolean => {
  return value.includes('TO_FILL_');
};
