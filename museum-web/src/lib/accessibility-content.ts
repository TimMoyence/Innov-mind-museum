export interface AccessibilitySection {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface AccessibilityContent {
  title: string;
  version: string;
  lastUpdated: string;
  sections: AccessibilitySection[];
}

const en: AccessibilityContent = {
  title: 'Accessibility Statement',
  version: 'v0.2',
  lastUpdated: '2026-05-13',
  sections: [
    {
      id: 'status',
      title: '1. Conformance status',
      paragraphs: [
        'Conformance to WCAG 2.1 level AA is currently PARTIAL.',
        'An automated audit (axe-core 4.11, headless Chromium) was conducted on 2026-05-13 across public web routes (landing, support, privacy, admin login, password reset, email verification, accessibility statement) in both FR and EN. One distinct violation was identified (see § 3).',
        'No claim of total or substantial conformance is made. Automated tooling catches an estimated 20%–50% of WCAG issues; a manual audit (keyboard, screen reader NVDA/VoiceOver/TalkBack) and user testing with persons with disabilities remain pending.',
      ],
    },
    {
      id: 'scope',
      title: '2. Scope',
      paragraphs: [
        'This statement covers the Musaium web surface (musaium.app — landing pages, support, privacy, accessibility, password reset, email verification) and the public-facing admin gate (/{locale}/admin/login).',
        'The Musaium mobile application (iOS + Android, com.musaium.mobile) is NOT covered by the current automated audit. A separate mobile a11y audit (VoiceOver, TalkBack, Accessibility Inspector, Accessibility Scanner) is planned.',
      ],
    },
    {
      id: 'findings',
      title: '3. Identified non-conformances (automated audit, 2026-05-13)',
      paragraphs: [
        'Color contrast — admin login divider (WCAG 1.4.3, Serious): the "or" / "ou" separator on /{locale}/admin/login uses the text-text-muted token (#94A3B8) on white (#FFFFFF), yielding a 2.56:1 contrast ratio instead of the required 4.5:1. Affects both /fr/admin/login and /en/admin/login. Target fix: 2026-06-30.',
        'All other audited routes (/{locale}, /{locale}/support, /{locale}/privacy, /{locale}/reset-password, /{locale}/verify-email) returned zero automated violations under WCAG 2.1 A + AA tag sets. This does NOT imply full conformance — see § 4.',
      ],
    },
    {
      id: 'limitations',
      title: '4. Audit limitations',
      paragraphs: [
        'Automated audit only — keyboard navigation, screen reader semantics, contrast perception, motion sensitivity, and cognitive load have NOT been verified by a human auditor.',
        'No user testing with persons with disabilities has been conducted.',
        'Mobile application is not in scope of this audit.',
        'Generated AI responses (chat) are non-deterministic by nature — a simplicity guardrail is not a substitute for formal cognitive accessibility.',
      ],
    },
    {
      id: 'feedback',
      title: '5. Feedback and enforcement',
      paragraphs: [
        'If you encounter an accessibility defect, contact support@musaium.app — target response within 7 business days.',
        'In France, you may also contact the Défenseur des droits (https://www.defenseurdesdroits.fr), the DGCCRF, or ARCOM. Users in other EU Member States should contact their national supervisory authority under Directive (EU) 2019/882 (European Accessibility Act).',
      ],
    },
    {
      id: 'reference',
      title: '6. Full statement',
      paragraphs: [
        'The complete declaration — including legal basis, design-element inventory, audit methodology and signature block — is published in the source repository at docs/legal/accessibility-statement-en.md (English) and docs/legal/accessibility-statement-fr.md (French).',
      ],
    },
  ],
};

const fr: AccessibilityContent = {
  title: "Déclaration d'accessibilité",
  version: 'v0.2',
  lastUpdated: '13 mai 2026',
  sections: [
    {
      id: 'status',
      title: '1. État de conformité',
      paragraphs: [
        'La conformité au niveau AA de la WCAG 2.1 est actuellement PARTIELLE.',
        "Un audit automatisé (axe-core 4.11, Chromium headless) a été conduit le 2026-05-13 sur les routes web publiques (landing, support, confidentialité, connexion admin, réinitialisation de mot de passe, vérification e-mail, déclaration d'accessibilité) en FR et EN. Une non-conformité distincte a été identifiée (cf. § 3).",
        "Aucune affirmation de conformité totale ou substantielle n'est faite. Les outils automatisés détectent environ 20% à 50% des problèmes WCAG ; un audit manuel (clavier, lecteur d'écran NVDA/VoiceOver/TalkBack) et des tests utilisateurs avec personnes en situation de handicap restent à mener.",
      ],
    },
    {
      id: 'scope',
      title: '2. Périmètre',
      paragraphs: [
        "Cette déclaration couvre la surface web Musaium (musaium.app — landing, support, confidentialité, accessibilité, réinitialisation de mot de passe, vérification d'e-mail) et la porte d'entrée admin publique (/{locale}/admin/login).",
        "L'application mobile Musaium (iOS + Android, com.musaium.mobile) n'est PAS couverte par l'audit automatisé actuel. Un audit a11y mobile distinct (VoiceOver, TalkBack, Accessibility Inspector, Accessibility Scanner) est planifié.",
      ],
    },
    {
      id: 'findings',
      title: '3. Non-conformités identifiées (audit automatisé, 2026-05-13)',
      paragraphs: [
        'Contraste de couleur — séparateur de la page de connexion admin (WCAG 1.4.3, Serious) : le séparateur « ou » / « or » sur /{locale}/admin/login utilise le token text-text-muted (#94A3B8) sur fond blanc (#FFFFFF), produisant un ratio de contraste de 2.56:1 au lieu des 4.5:1 requis. Affecte /fr/admin/login et /en/admin/login. Échéance de correction : 2026-06-30.',
        "Toutes les autres routes auditées (/{locale}, /{locale}/support, /{locale}/privacy, /{locale}/reset-password, /{locale}/verify-email) n'ont retourné aucune violation automatisée sous les jeux de règles WCAG 2.1 A + AA. Cela n'implique PAS une conformité totale — cf. § 4.",
      ],
    },
    {
      id: 'limitations',
      title: "4. Limitations de l'audit",
      paragraphs: [
        "Audit automatisé uniquement — la navigation clavier, la sémantique lecteur d'écran, la perception du contraste, la sensibilité au mouvement et la charge cognitive n'ont PAS été vérifiées par un auditeur humain.",
        "Aucun test utilisateur avec personnes en situation de handicap n'a été conduit.",
        "L'application mobile n'est pas dans le périmètre de cet audit.",
        'Les réponses IA générées (chat) sont non-déterministes par nature — un guardrail de simplicité ne se substitue pas à une accessibilité cognitive formelle.',
      ],
    },
    {
      id: 'feedback',
      title: '5. Voies de recours et feedback',
      paragraphs: [
        "Si vous constatez un défaut d'accessibilité, contactez support@musaium.app — réponse cible sous 7 jours ouvrés.",
        "En France, vous pouvez également saisir le Défenseur des droits (https://www.defenseurdesdroits.fr), la DGCCRF ou l'ARCOM. Les utilisateurs résidant dans un autre État membre de l'UE doivent saisir l'autorité de contrôle nationale au titre de la Directive (UE) 2019/882 (European Accessibility Act).",
      ],
    },
    {
      id: 'reference',
      title: '6. Déclaration complète',
      paragraphs: [
        "La déclaration complète — incluant base juridique, inventaire des éléments de conception, méthodologie d'audit et bloc de signature — est publiée dans le dépôt source à docs/legal/accessibility-statement-fr.md (français) et docs/legal/accessibility-statement-en.md (anglais).",
      ],
    },
  ],
};

const accessibilityContentByLocale = { en, fr } as const;

type AccessibilityLocale = keyof typeof accessibilityContentByLocale;

function isAccessibilityLocale(locale: string): locale is AccessibilityLocale {
  return locale in accessibilityContentByLocale;
}

export function getAccessibilityContent(locale: string): AccessibilityContent {
  return isAccessibilityLocale(locale)
    ? accessibilityContentByLocale[locale]
    : accessibilityContentByLocale.en;
}
