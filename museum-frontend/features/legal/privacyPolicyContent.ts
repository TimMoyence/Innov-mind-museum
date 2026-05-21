/**
 * GENERATED-FROM-CANONICAL — DO NOT EDIT MANUALLY.
 *
 * Regenerate with:
 *   node museum-frontend/scripts/codegen-legal-content.mjs
 *
 * Source of truth:
 *   museum-backend/src/shared/legal/privacy-content.canonical.json
 *
 * Drift sentinel (post-comment-strip, R15):
 *   museum-backend/scripts/sentinels/privacy-content-drift.mjs
 *
 * The sentinel strips JSDoc / line / HTML comments before grepping, so the
 * canonical tokens (version, lastUpdated, section ids, subprocessor names)
 * must appear as INLINE TS literals in the body below — not just in this
 * header.
 */

/** A single numbered section within the privacy policy document. */
export interface PrivacyPolicySection {
  id: string;
  title: string;
  paragraphs: string[];
}

/** A single subprocessor row (R11 — 19 vendors, EU AI Act + GDPR Art. 28). */
export interface PrivacySubprocessor {
  name: string;
  role: string;
  jurisdiction: string;
  transferMechanism: 'SCC' | 'adequacy' | 'none' | 'internal';
  category: string;
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
  quickFacts: { label: string; value: string }[];
  releaseChecklist: string[];
  sections: PrivacyPolicySection[];
  subprocessors: PrivacySubprocessor[];
}

/**
 * Subprocessors disclosed on every public surface (R11). Emitted as a
 * top-level export so the drift sentinel and the in-app subprocessors view
 * both grep / consume the same list.
 */
export const PRIVACY_SUBPROCESSORS: readonly PrivacySubprocessor[] = [
  {
    name: 'OpenAI',
    role: 'LLM provider — text and vision',
    jurisdiction: 'United States',
    transferMechanism: 'SCC',
    category: 'LLM',
  },
  {
    name: 'Google Cloud',
    role: 'Alternative LLM provider — Vertex AI',
    jurisdiction: 'United States / EU',
    transferMechanism: 'SCC',
    category: 'LLM',
  },
  {
    name: 'DeepSeek',
    role: 'Alternative LLM provider (NOT enabled in EU production)',
    jurisdiction: 'China',
    transferMechanism: 'none',
    category: 'LLM',
  },
  {
    name: 'OVH SAS',
    role: 'Server and database hosting',
    jurisdiction: 'France',
    transferMechanism: 'internal',
    category: 'infra',
  },
  {
    name: 'Amazon Web Services',
    role: 'Object storage (S3) in EU regions',
    jurisdiction: 'EU',
    transferMechanism: 'internal',
    category: 'infra',
  },
  {
    name: 'Expo',
    role: 'Mobile app distribution and over-the-air updates (EAS)',
    jurisdiction: 'United States',
    transferMechanism: 'SCC',
    category: 'infra',
  },
  {
    name: 'Brevo',
    role: 'Transactional email delivery',
    jurisdiction: 'France',
    transferMechanism: 'internal',
    category: 'email',
  },
  {
    name: 'Sentry',
    role: 'Error monitoring and performance telemetry',
    jurisdiction: 'United States',
    transferMechanism: 'SCC',
    category: 'monitoring',
  },
  {
    name: 'Apple',
    role: 'Federated authentication (Sign in with Apple)',
    jurisdiction: 'United States',
    transferMechanism: 'SCC',
    category: 'auth',
  },
  {
    name: 'Tavily',
    role: 'Web search backend (RAG)',
    jurisdiction: 'United States',
    transferMechanism: 'SCC',
    category: 'search',
  },
  {
    name: 'Brave',
    role: 'Alternative web search backend',
    jurisdiction: 'United States',
    transferMechanism: 'SCC',
    category: 'search',
  },
  {
    name: 'Unsplash',
    role: 'Public image library for cultural references',
    jurisdiction: 'United States',
    transferMechanism: 'SCC',
    category: 'search',
  },
  {
    name: 'Langfuse',
    role: 'LLM observability and prompt telemetry',
    jurisdiction: 'Germany',
    transferMechanism: 'internal',
    category: 'telemetry',
  },
  {
    name: 'CARTO',
    role: 'Map tiles for the museum map view (CartoDB)',
    jurisdiction: 'United States',
    transferMechanism: 'SCC',
    category: 'mapping',
  },
  {
    name: 'Wikidata',
    role: 'Structured knowledge base for cultural references',
    jurisdiction: 'Germany',
    transferMechanism: 'internal',
    category: 'search',
  },
  {
    name: 'Wikimedia',
    role: 'Wikipedia REST — encyclopedic content for cultural references',
    jurisdiction: 'United States',
    transferMechanism: 'SCC',
    category: 'search',
  },
  {
    name: 'Nominatim',
    role: 'Reverse geocoding for museum/monument detection',
    jurisdiction: 'Germany',
    transferMechanism: 'internal',
    category: 'mapping',
  },
  {
    name: 'OpenStreetMap Foundation',
    role: 'Spatial queries for monuments (Overpass API)',
    jurisdiction: 'United Kingdom',
    transferMechanism: 'adequacy',
    category: 'mapping',
  },
  {
    name: 'Better-Stack',
    role: 'Uptime monitoring and incident alerting',
    jurisdiction: 'Germany',
    transferMechanism: 'internal',
    category: 'uptime',
  },
] as const;

/** Complete privacy policy content for the Musaium app, structured for in-app rendering. */
export const PRIVACY_POLICY_CONTENT: PrivacyPolicyContent = {
  title: 'Privacy Policy (GDPR / RGPD)',
  version: '1.0.0',
  lastUpdated: '2026-05-21',
  controllerName: 'InnovMind (Tim Moyence, Entrepreneur Individuel)',
  controllerAddress: 'France',
  contactEmail: 'tim.moyence@gmail.com',
  dpoContact: "Non désigné (non requis au titre de l'article 37 du RGPD)",
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
        'Contact: tim.moyence@gmail.com.',
        'Pursuant to Article 37 GDPR, the designation of a Data Protection Officer (DPO) is not required for our organisation.',
      ],
    },
    {
      id: 'data-collected',
      title: '2. Data We Collect',
      paragraphs: [
        'Account data: email address, hashed and salted password, account creation date, user preferences (language, theme).',
        'Conversation data: text messages exchanged during chat sessions, AI-generated responses, session metadata (timestamps, session identifiers, museum context where applicable).',
        'Visual and audio data: photographs of artworks taken or imported by the user; audio recordings of voice questions. These are transmitted to AI services for analysis and kept only for the time required for processing.',
        'Technical data: device type and version, operating system, app version, anonymised technical identifiers, error and performance logs.',
        'Support data: messages sent through support channels (Instagram/Telegram) may be processed by those platforms under their own privacy policies.',
      ],
    },
    {
      id: 'purposes',
      title: '3. Purposes & Legal Bases (GDPR Art. 6)',
      paragraphs: [
        'Provide museum-focused AI assistance about artworks, monuments, museums, architecture, and cultural heritage — Contract performance (Art. 6(1)(b)).',
        'Operate authentication, secure sessions, error handling, and support workflows — Contract performance (Art. 6(1)(b)).',
        'Security monitoring, fraud prevention, service reliability and product diagnostics — Legitimate interests (Art. 6(1)(f)).',
        'Device permissions (camera, microphone, photo library) — Consent (Art. 6(1)(a)), only when the user explicitly triggers the feature.',
        'Granular third-party AI consent (text/image/audio/profile × OpenAI/Google) — Consent (Art. 6(1)(a)) layered on top of contract performance.',
      ],
    },
    {
      id: 'device-permissions',
      title: '4. Device Permissions',
      paragraphs: [
        'Camera — used to photograph artworks for AI-driven contextual information. No background capture.',
        'Microphone — used for voice questions. Audio is transmitted for transcription, then deleted after processing.',
        'Photo Library — used to import an existing image from the gallery. Only the selected image is accessible to the application.',
        'No passive collection: permissions are only used when the user actively triggers the matching feature.',
      ],
    },
    {
      id: 'recipients',
      title: '5. Recipients & Sub-processors',
      paragraphs: [
        'Authorised internal personnel, on a need-to-know basis.',
        'Sub-processors are listed in §5.1 below. Each transfer outside the European Economic Area (EEA) is governed by appropriate safeguards (Standard Contractual Clauses, adequacy decision, or equivalent mechanism).',
        'OpenAI (United States) — LLM provider for text and vision; transfer mechanism: SCC.',
        'Google Cloud / Vertex AI (United States / EU) — alternative LLM provider; transfer mechanism: SCC.',
        'DeepSeek (China) — alternative LLM provider, NOT enabled in EU production builds; transfer mechanism: none (not used in EU).',
        'OVH SAS (France) — server and database hosting; data stays in the EU; transfer mechanism: internal (EU).',
        'Amazon Web Services (EU) — object storage (S3) in EU regions; transfer mechanism: internal (EU).',
        'Expo / EAS (United States) — mobile app distribution and over-the-air updates; transfer mechanism: SCC.',
        'Brevo (France) — transactional email delivery (verification, password reset); transfer mechanism: internal (EU).',
        'Sentry (United States) — error monitoring and performance telemetry; sendDefaultPii is disabled and a custom scrubber strips PII; transfer mechanism: SCC.',
        'Apple (Sign in with Apple, United States) — federated authentication; transfer mechanism: SCC.',
        'Tavily (United States) — web search backend for retrieval-augmented generation; transfer mechanism: SCC.',
        'Brave (United States) — alternative web search backend; transfer mechanism: SCC.',
        'Unsplash (United States) — public image library for cultural references; transfer mechanism: SCC.',
        'Langfuse (Germany) — LLM observability and prompt telemetry; transfer mechanism: internal (EU).',
        'CARTO (CartoDB tiles, United States) — map tiles for the museum map view; transfer mechanism: SCC.',
        'Wikidata (Germany) — structured knowledge base for cultural references; transfer mechanism: internal (EU).',
        'Wikimedia (Wikipedia REST, United States) — encyclopedic content for cultural references; transfer mechanism: SCC.',
        'Nominatim (Germany) — reverse geocoding for museum/monument detection; transfer mechanism: internal (EU).',
        'OpenStreetMap Foundation (United Kingdom, Overpass API) — spatial queries for monuments; transfer mechanism: adequacy.',
        'Better-Stack (Germany) — uptime monitoring and incident alerting; transfer mechanism: internal (EU).',
      ],
    },
    {
      id: 'transfers',
      title: '6. International Transfers',
      paragraphs: [
        'Where personal data is transferred outside the EEA / UK / Switzerland, transfers are governed by Standard Contractual Clauses (SCC), an adequacy decision, or an equivalent safeguard.',
        'Data hosted on OVH and AWS stays within the European Union.',
      ],
    },
    {
      id: 'retention',
      title: '7. Retention Periods',
      paragraphs: [
        'Account data, chat history, and uploaded images: kept for the duration of service use and deleted on request.',
        'Audio recordings (voice questions): not stored — transmitted for transcription then immediately deleted.',
        'Authentication tokens: access tokens valid for 15 minutes; refresh tokens valid for 30 days.',
      ],
    },
    {
      id: 'security',
      title: '8. Security Measures',
      paragraphs: [
        'Musaium uses technical and organisational safeguards including access controls, transport encryption (TLS), environment isolation, password hashing (bcrypt), and operational monitoring.',
        'No system is risk-free. Users should avoid sharing unnecessary sensitive personal data in chat conversations.',
      ],
    },
    {
      id: 'rights',
      title: '9. Your GDPR Rights',
      paragraphs: [
        'You may request access, rectification, erasure, restriction, portability, and objection to processing where applicable.',
        'Where processing is based on consent, you may withdraw consent at any time without affecting the lawfulness of processing before withdrawal.',
        'To exercise your rights, contact: tim.moyence@gmail.com. Include enough information to verify your request. Response within one month (Art. 12(3) GDPR), extendable by two months if necessary.',
      ],
    },
    {
      id: 'minors',
      title: '10. Children & Minors',
      paragraphs: [
        'Musaium is not intended for users under 15 years old. Pursuant to Article 8 GDPR and Article 45 of the French Data Protection Act (Loi Informatique et Libertés), and consistent with CNIL Délibération 2021-018 setting the French digital majority at 15 years, users under 15 require parental authorisation to create an account.',
        'If you believe a minor under 15 years old provided personal data without parental authorisation, contact us at tim.moyence@gmail.com so we can promptly delete the relevant data.',
        'Reference: CNIL Délibération 2021-018 (French digital majority — 15 years).',
      ],
    },
    {
      id: 'cookies',
      title: '11. Cookies & Trackers',
      paragraphs: [
        'Musaium is a native mobile app. It does not use cookies within the meaning of the ePrivacy Directive.',
        'The web landing site uses strictly-necessary cookies only (e.g. admin authentication redirect hint, CSRF token). No advertising trackers, no behavioural analytics SDKs (no Vercel Analytics, no Session Replay, no PostHog, no Google Analytics, no Hotjar, no Matomo, no Plausible, no Umami, no Fathom, no Segment, no Mixpanel).',
        'The only technical identifiers used are authentication tokens (JWT), required for service operation and stored securely on your device.',
      ],
    },
    {
      id: 'ai-disclosure',
      title: '12. AI Generative Content (EU AI Act Art. 50)',
      paragraphs: [
        'When you interact with Musaium, you are interacting with a generative AI assistant powered by third-party large language models (OpenAI, Google, DeepSeek). Replies are produced automatically and may contain errors, omissions, or factual inaccuracies — please verify critical information with primary sources.',
        'Voice messages are transcribed by a speech-to-text model; spoken replies are synthesised by a text-to-speech model. Audio buffers are not stored beyond the request lifecycle.',
        'This disclosure is provided pursuant to Article 50 of the EU AI Act (Regulation (EU) 2024/1689).',
      ],
    },
    {
      id: 'granular-ai-consent',
      title: '13. Granular Third-Party AI Consent',
      paragraphs: [
        'In addition to the general AI disclosure above (§12), the Musaium mobile app captures separate, explicit consent for each combination of (data category × third-party AI provider) before transmitting personal data outside Musaium-controlled infrastructure.',
        'Consent scopes recorded today include: text messages to OpenAI (required to use the chat) and to Google; photos / images to OpenAI and Google; audio to OpenAI and Google; profile to OpenAI and Google. DeepSeek scopes are intentionally NOT offered in the EU production build.',
        'All grants and revocations are persisted in our backend (user_consents table) and logged in our internal audit trail (audit_logs) with timestamp, IP, and request identifier. You may view and revoke any of these grants at any time from Settings → AI Consent in the mobile app.',
        'Revocation of location-to-LLM is enforced in real time. Other third-party AI revocations are recorded as user intent; full enforcement is account deletion.',
      ],
    },
    {
      id: 'changes',
      title: '14. Policy Changes',
      paragraphs: [
        'We may update this policy to reflect legal, technical, or product changes. Material changes will be communicated in-app or through appropriate channels before, or when, they take effect.',
        'The last-updated date and version number appear at the top of this document.',
      ],
    },
  ],
  subprocessors: [...PRIVACY_SUBPROCESSORS],
};

/**
 * Checks whether a string contains a placeholder marker that must be replaced before release.
 * @param value - String to inspect.
 * @returns `true` if the value contains `'TO_FILL_'`.
 */
export const isPrivacyPlaceholderValue = (value: string): boolean => {
  return value.includes('TO_FILL_');
};
