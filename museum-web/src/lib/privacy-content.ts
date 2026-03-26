import type { Locale } from './i18n';

export interface PrivacySection {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface PrivacyContent {
  title: string;
  version: string;
  lastUpdated: string;
  sections: PrivacySection[];
}

const en: PrivacyContent = {
  title: 'Privacy Policy (GDPR)',
  version: '1.0.0',
  lastUpdated: '2026-03-18',
  sections: [
    {
      id: 'controller',
      title: '1. Data Controller',
      paragraphs: [
        'Musaium is operated by InnovMind (Tim Moyence, Entrepreneur Individuel), acting as data controller for personal data processed through the mobile application and related support channels.',
        'Registered address: France.',
        'Contact: tim.moyence@gmail.com',
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
      title: '5. Recipients & Processors',
      paragraphs: [
        'Authorized internal personnel, on a need-to-know basis.',
        'Sub-processors: OpenAI (United States), Google Cloud (United States/EU), DeepSeek (China), OVH SAS (France, EU data), Amazon Web Services (EU, EU data), Expo/EAS (United States).',
        'No payment processors are used at this time.',
      ],
    },
    {
      id: 'transfers',
      title: '6. International Transfers',
      paragraphs: [
        'Some processors may process data outside the EEA/UK/Switzerland. Where applicable, transfers are governed by appropriate safeguards such as SCCs, adequacy decisions, or equivalent mechanisms.',
        'Data hosted on OVH and AWS remains within the European Union.',
      ],
    },
    {
      id: 'retention',
      title: '7. Retention Periods',
      paragraphs: [
        'Account data, chat history, and images: retained for the duration of service use, deleted upon request.',
        'Audio files (voice questions): not stored — transmitted for transcription then immediately deleted.',
        'Authentication tokens: access tokens valid for 15 minutes, refresh tokens for 30 days.',
      ],
    },
    {
      id: 'security',
      title: '8. Security Measures',
      paragraphs: [
        'Musaium uses technical and organizational safeguards including access controls, transport encryption (TLS), environment isolation, password hashing (bcrypt), and operational monitoring.',
        'No system is risk-free. Users should avoid sharing unnecessary sensitive personal data in chat conversations.',
      ],
    },
    {
      id: 'rights',
      title: '9. Your GDPR Rights',
      paragraphs: [
        'You may request access, rectification, erasure, restriction, portability, and objection to processing where applicable.',
        'Where processing is based on consent, you may withdraw consent at any time without affecting the lawfulness of processing before withdrawal.',
        'To exercise your rights, contact: tim.moyence@gmail.com. Include enough information to verify your request.',
      ],
    },
    {
      id: 'complaints',
      title: '10. Complaints',
      paragraphs: [
        'You may lodge a complaint with your local supervisory authority.',
        'Lead authority (if applicable): CNIL (Commission Nationale de l\'Informatique et des Libertés), 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France.',
      ],
    },
    {
      id: 'minors',
      title: '11. Children & Minors',
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

const fr: PrivacyContent = {
  title: 'Politique de confidentialité (RGPD)',
  version: '1.0.0',
  lastUpdated: '18 mars 2026',
  sections: [
    {
      id: 'controller',
      title: '1. Responsable du traitement',
      paragraphs: [
        'Musaium est opéré par InnovMind (Tim Moyence, Entrepreneur Individuel), agissant en qualité de responsable du traitement des données personnelles traitées via l\'application mobile et les canaux de support associés.',
        'Adresse : France.',
        'Contact : tim.moyence@gmail.com',
      ],
    },
    {
      id: 'data-collected',
      title: '2. Données collectées',
      paragraphs: [
        'Données de compte : adresse e-mail, identifiants d\'authentification et métadonnées de statut de compte.',
        'Données d\'utilisation : messages de chat, images téléversées, messages vocaux soumis pour transcription, horodatages, métadonnées d\'appareil/runtime et diagnostics applicatifs nécessaires au support.',
        'Données de support : les messages envoyés via les canaux de support (Instagram/Telegram) peuvent être traités par ces plateformes selon leurs propres politiques de confidentialité.',
      ],
    },
    {
      id: 'purposes',
      title: '3. Finalités du traitement',
      paragraphs: [
        'Fournir une assistance muséale par IA concernant les œuvres d\'art, monuments, musées, architecture et patrimoine culturel.',
        'Opérer l\'authentification, les sessions sécurisées, la gestion des erreurs et les flux de support.',
        'Améliorer la qualité du service, surveiller les abus/garde-fous et maintenir la sécurité et la fiabilité.',
      ],
    },
    {
      id: 'legal-basis',
      title: '4. Bases légales (RGPD Art. 6)',
      paragraphs: [
        'Exécution du contrat (Art. 6(1)(b)) pour l\'accès au compte et les fonctionnalités principales de l\'application.',
        'Intérêts légitimes (Art. 6(1)(f)) pour la surveillance de sécurité, la prévention de la fraude, la fiabilité du service et les diagnostics produit.',
        'Consentement (Art. 6(1)(a)) pour les permissions d\'appareil telles que la caméra/microphone, lorsque requises par la plateforme et uniquement lorsque l\'utilisateur déclenche explicitement ces fonctionnalités.',
      ],
    },
    {
      id: 'recipients',
      title: '5. Destinataires et sous-traitants',
      paragraphs: [
        'Personnel interne autorisé, sur la base du besoin d\'en connaître.',
        'Sous-traitants : OpenAI (États-Unis), Google Cloud (États-Unis/UE), DeepSeek (Chine), OVH SAS (France, données UE), Amazon Web Services (UE, données UE), Expo/EAS (États-Unis).',
        'Aucun prestataire de paiement n\'est utilisé à ce jour.',
      ],
    },
    {
      id: 'transfers',
      title: '6. Transferts internationaux',
      paragraphs: [
        'Certains sous-traitants peuvent traiter des données en dehors de l\'EEE/Royaume-Uni/Suisse. Le cas échéant, les transferts sont encadrés par des garanties appropriées telles que les CCT, décisions d\'adéquation ou mécanismes équivalents.',
        'Les données hébergées chez OVH et AWS restent dans l\'Union européenne.',
      ],
    },
    {
      id: 'retention',
      title: '7. Durées de conservation',
      paragraphs: [
        'Données de compte, historique de conversations et images : conservés pendant la durée d\'utilisation du service, supprimés sur demande.',
        'Fichiers audio (questions vocales) : non stockés — transmis pour transcription puis immédiatement supprimés.',
        'Jetons d\'authentification : accès 15 minutes, renouvellement 30 jours.',
      ],
    },
    {
      id: 'security',
      title: '8. Mesures de sécurité',
      paragraphs: [
        'Musaium utilise des mesures techniques et organisationnelles comprenant le contrôle d\'accès, le chiffrement des transports (TLS), l\'isolation des environnements, le hachage des mots de passe (bcrypt) et la surveillance opérationnelle.',
        'Aucun système n\'est sans risque. Les utilisateurs sont invités à ne pas partager de données personnelles sensibles inutiles dans les conversations de chat.',
      ],
    },
    {
      id: 'rights',
      title: '9. Vos droits RGPD',
      paragraphs: [
        'Vous pouvez demander l\'accès, la rectification, l\'effacement, la limitation, la portabilité et l\'opposition au traitement, dans les conditions prévues par la loi.',
        'Lorsque le traitement est fondé sur le consentement, vous pouvez le retirer à tout moment sans affecter la licéité du traitement antérieur.',
        'Pour exercer vos droits, contactez : tim.moyence@gmail.com. Incluez suffisamment d\'informations pour vérifier votre demande.',
      ],
    },
    {
      id: 'complaints',
      title: '10. Réclamations',
      paragraphs: [
        'Vous pouvez introduire une réclamation auprès de votre autorité de contrôle locale.',
        'Autorité chef de file (le cas échéant) : CNIL (Commission Nationale de l\'Informatique et des Libertés), 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07.',
      ],
    },
    {
      id: 'minors',
      title: '11. Enfants et mineurs',
      paragraphs: [
        'Musaium n\'est pas destiné aux enfants en dessous de l\'âge requis par la loi applicable sans autorisation parentale. Si vous pensez qu\'un mineur a fourni des données de manière illicite, contactez tim.moyence@gmail.com.',
      ],
    },
    {
      id: 'changes',
      title: '12. Modifications de la politique',
      paragraphs: [
        'Nous pouvons mettre à jour cette politique pour refléter des changements légaux, techniques ou produit. Les modifications substantielles seront communiquées dans l\'application ou via les canaux appropriés avant ou lors de leur entrée en vigueur.',
      ],
    },
  ],
};

const privacyContentByLocale: Record<string, PrivacyContent> = { en, fr };

export function getPrivacyContent(locale: string): PrivacyContent {
  return privacyContentByLocale[locale] ?? privacyContentByLocale.en;
}
