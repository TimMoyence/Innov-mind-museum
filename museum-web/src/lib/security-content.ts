import type { Locale } from '@/lib/i18n';

export interface SecuritySection {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface SecurityContent {
  title: string;
  subtitle: string;
  version: string;
  lastUpdated: string;
  sections: SecuritySection[];
}

const en: SecurityContent = {
  title: 'Vulnerability Disclosure Policy',
  subtitle:
    'How to report a security issue to Musaium and what to expect in return — researcher safe harbour, scope, timelines, and the CRA reporting protocol.',
  version: 'v1.0',
  lastUpdated: '2026-05-14',
  sections: [
    {
      id: 'reporting',
      title: '1. Reporting channel',
      paragraphs: [
        'Email security@musaium.com with a description of the issue, reproduction steps, affected component (backend / mobile / web), and your contact details. Anonymous reports are welcome.',
        'PGP-encrypted submission is available on request — email us and we will arrange a key exchange. A public PGP key will be published at https://musaium.com/.well-known/pgp-key.txt once V1 ships.',
        'Please do NOT open public GitHub issues, post on social media, or contact unrelated team members for vulnerability reports. The security email is the only official channel.',
        'Discovery resources: https://musaium.com/.well-known/security.txt (RFC 9116) and our SECURITY.md on GitHub.',
      ],
    },
    {
      id: 'commitments',
      title: '2. Our commitments',
      paragraphs: [
        'Acknowledgement within 5 working days of receipt (target 24 hours).',
        'Initial triage decision (in-scope / out-of-scope, severity) within 10 working days.',
        'Status updates at least every 2 weeks while remediation is in progress.',
        'Patch and public advisory target: 90 days from acknowledgement, with a possible 30-day extension communicated to the reporter when remediation is complex.',
        'Credit on our hall-of-fame page after the issue is fixed, if you wish (and if the report is in scope and accurate).',
      ],
    },
    {
      id: 'scope',
      title: '3. Scope — in scope',
      paragraphs: [
        'musaium.com and *.musaium.com (production web and API endpoints).',
        'The Musaium iOS app distributed via the App Store (current version).',
        'The Musaium Android app distributed via Google Play (current version).',
        'The OpenAPI surface served at api.musaium.com.',
      ],
    },
    {
      id: 'out-of-scope',
      title: '4. Out of scope',
      paragraphs: [
        'Third-party services we use but do not control: App Store, Google Play, OVH, Stripe, OpenAI, Deepseek, Google AI, Sentry, museum data partners, CDN providers. Report directly to them.',
        'Denial-of-service (DoS / DDoS), volumetric attacks, resource exhaustion.',
        'Social engineering of staff, contractors, museums or users (phishing, vishing, SMS).',
        'Physical security testing (office access, devices).',
        'Automated scanner output without proof of real impact.',
        'Findings limited to outdated dependency versions without a demonstrated exploit path.',
        'Reports requiring already-compromised user accounts or already-rooted / jailbroken devices.',
        'Self-XSS, missing security headers without an exploit, clickjacking on non-sensitive pages, missing rate limiting on non-sensitive endpoints.',
        'Issues affecting only unsupported / outdated browsers or OS versions.',
        'Vulnerabilities only exploitable via debug builds or developer-mode features.',
      ],
    },
    {
      id: 'rules',
      title: '5. Rules for researchers',
      paragraphs: [
        'Make a good-faith effort to avoid harm to users, services, and data.',
        'Use test accounts you create yourself; never access another user’s data.',
        'Stop and report immediately if you encounter personal data, payment data, or credentials that are not yours. Do not exfiltrate, store, or share any data you accidentally access.',
        'Do not perform DoS, social engineering, or physical testing. Do not pivot to non-Musaium systems or attack our suppliers / partners.',
        'Give us reasonable time to remediate before public disclosure (default 90 days, Project Zero "90 + 30" pattern).',
      ],
    },
    {
      id: 'safe-harbour',
      title: '6. Safe harbour',
      paragraphs: [
        'When you conduct vulnerability research according to this policy, we consider your activities authorised under applicable anti-hacking laws (French Code pénal art. 323-1 et seq., German StGB §202c, US CFAA 18 U.S.C. §1030, UK Computer Misuse Act and equivalents) and applicable anti-circumvention laws (art. 6 of EU Directive 2001/29/EC, US DMCA §1201).',
        'We exempt your activity from restrictions in our Terms of Service and Acceptable Use Policy that would otherwise prohibit security research, and consider it lawful, helpful to the security of our users, and conducted in good faith.',
        'We will not pursue legal action for good-faith research within this policy. If a third party brings legal action against you for activity that complied with this policy, we will make this safe harbour known.',
        'Limits we cannot waive: this safe harbour applies only to legal claims under our control. It cannot bind third parties (App Store, Google Play, OVH, Stripe, OpenAI, museum partners). Activity outside this policy — willful harm, ransom demands, unauthorised data exfiltration, social engineering — is not covered.',
      ],
    },
    {
      id: 'disclosure',
      title: '7. Coordinated disclosure timeline',
      paragraphs: [
        'Default coordination window: 90 days from acknowledgement, with optional 30-day extension when remediation is complex. Public advisory published 30 days after the patch ships, allowing users an update window.',
        'For actively-exploited vulnerabilities qualifying under EU Cyber Resilience Act (Regulation 2024/2847), we follow the ENISA Single Reporting Platform timeline starting 2026-09-11: 24-hour early warning, 72-hour full notification, 14-day final report after fix available. Triage details: docs/operations/VDP_RUNBOOK.md.',
        'CVE assignment for findings with CVSS 4.0 ≥ 4.0: requested via MITRE.',
      ],
    },
    {
      id: 'hall-of-fame',
      title: '8. Hall of fame',
      paragraphs: [
        'Researchers who report valid in-scope issues are listed here (with permission) after the issue is fixed. The hall-of-fame is empty pre-launch.',
      ],
    },
  ],
};

const fr: SecurityContent = {
  title: 'Politique de divulgation des vulnérabilités',
  subtitle:
    'Comment signaler un problème de sécurité à Musaium et ce à quoi vous attendre — safe harbour chercheur, périmètre, délais et protocole de signalement CRA.',
  version: 'v1.0',
  lastUpdated: '2026-05-14',
  sections: [
    {
      id: 'reporting',
      title: '1. Canal de signalement',
      paragraphs: [
        'Envoyez un courriel à security@musaium.com avec une description du problème, les étapes de reproduction, le composant concerné (backend / mobile / web) et vos coordonnées. Les signalements anonymes sont acceptés.',
        'L’envoi chiffré PGP est disponible sur demande — écrivez-nous et nous organiserons un échange de clé. Une clé publique sera publiée à https://musaium.com/.well-known/pgp-key.txt après la V1.',
        'Merci de ne PAS ouvrir d’issues GitHub publiques, ni publier sur les réseaux sociaux, ni contacter d’autres membres de l’équipe pour un signalement de vulnérabilité. Le courriel security@ est le seul canal officiel.',
        'Ressources de découverte : https://musaium.com/.well-known/security.txt (RFC 9116) et notre SECURITY.md sur GitHub.',
      ],
    },
    {
      id: 'commitments',
      title: '2. Nos engagements',
      paragraphs: [
        'Accusé de réception sous 5 jours ouvrés (cible 24 heures).',
        'Décision de triage initial (in/out of scope, sévérité) sous 10 jours ouvrés.',
        'Mises à jour de statut au minimum toutes les 2 semaines pendant la remédiation.',
        'Cible de correctif et avis public : 90 jours après accusé de réception, avec une extension possible de 30 jours communiquée au rapporteur quand la remédiation est complexe.',
        'Crédit sur notre page hall-of-fame après correction, si vous le souhaitez (et si le rapport est in-scope et exact).',
      ],
    },
    {
      id: 'scope',
      title: '3. Périmètre — dans le périmètre',
      paragraphs: [
        'musaium.com et *.musaium.com (web et API de production).',
        'L’application Musaium iOS distribuée via l’App Store (version courante).',
        'L’application Musaium Android distribuée via Google Play (version courante).',
        'La surface OpenAPI servie à api.musaium.com.',
      ],
    },
    {
      id: 'out-of-scope',
      title: '4. Hors périmètre',
      paragraphs: [
        'Services tiers que nous utilisons mais ne contrôlons pas : App Store, Google Play, OVH, Stripe, OpenAI, Deepseek, Google AI, Sentry, partenaires musées, fournisseurs CDN. Signalez-leur directement.',
        'Déni de service (DoS / DDoS), attaques volumétriques, épuisement de ressources.',
        'Ingénierie sociale du personnel, des contractants, des musées ou des utilisateurs (phishing, vishing, SMS).',
        'Tests de sécurité physique (accès aux locaux, appareils).',
        'Résultats d’outils automatisés sans preuve d’impact réel.',
        'Constats limités à des versions de dépendances obsolètes sans chemin d’exploitation démontré.',
        'Rapports nécessitant des comptes utilisateurs déjà compromis ou des appareils déjà rootés / jailbreakés.',
        'Self-XSS, en-têtes de sécurité manquants sans exploit, clickjacking sur pages non sensibles, absence de rate limiting sur endpoints non sensibles.',
        'Problèmes ne touchant que des navigateurs ou OS obsolètes / non supportés.',
        'Vulnérabilités exploitables uniquement via builds debug ou mode développeur.',
      ],
    },
    {
      id: 'rules',
      title: '5. Règles pour les chercheurs',
      paragraphs: [
        'Faites un effort de bonne foi pour éviter de nuire aux utilisateurs, aux services et aux données.',
        'Utilisez des comptes de test que vous créez vous-même ; n’accédez jamais aux données d’un autre utilisateur.',
        'Arrêtez-vous et signalez immédiatement si vous croisez des données personnelles, des données de paiement ou des identifiants qui ne sont pas les vôtres. N’exfiltrez pas, ne stockez pas, ne partagez pas ce à quoi vous auriez accédé par accident.',
        'Pas de DoS, pas d’ingénierie sociale, pas de test physique. Pas de pivot hors périmètre Musaium ni d’attaque sur nos fournisseurs / partenaires.',
        'Donnez-nous un délai raisonnable de remédiation avant toute divulgation publique (90 jours par défaut, motif Project Zero « 90 + 30 »).',
      ],
    },
    {
      id: 'safe-harbour',
      title: '6. Safe harbour',
      paragraphs: [
        'Si votre recherche respecte cette politique, nous considérons votre activité autorisée sous les lois anti-piratage applicables (Code pénal français art. 323-1 et suivants, StGB allemand §202c, CFAA US 18 U.S.C. §1030, UK Computer Misuse Act et équivalents) et sous les lois anti-contournement applicables (art. 6 de la Directive UE 2001/29/CE, DMCA US §1201).',
        'Nous exemptons votre activité des restrictions de nos Conditions d’utilisation et politique d’usage acceptable qui interdiraient autrement la recherche de sécurité et la considérons légale, utile à la sécurité de nos utilisateurs et menée de bonne foi.',
        'Nous n’engagerons aucune action en justice pour une recherche de bonne foi conforme à cette politique. Si un tiers engage une action contre vous pour une activité conforme, nous ferons valoir publiquement ce safe harbour.',
        'Limites que nous ne pouvons lever : ce safe harbour ne couvre que les prétentions juridiques qui relèvent de nous. Il ne peut engager les tiers (App Store, Google Play, OVH, Stripe, OpenAI, partenaires musées). Les activités hors politique — nuisance intentionnelle, demandes de rançon, exfiltration non autorisée, ingénierie sociale — ne sont pas couvertes.',
      ],
    },
    {
      id: 'disclosure',
      title: '7. Divulgation coordonnée',
      paragraphs: [
        'Fenêtre de coordination par défaut : 90 jours après accusé de réception, avec une extension possible de 30 jours en cas de remédiation complexe. Avis public 30 jours après la mise à disposition du correctif (motif Project Zero « 90 + 30 »), pour permettre une fenêtre de mise à jour des utilisateurs.',
        'Pour les vulnérabilités activement exploitées qualifiées au titre du Règlement UE Cyber Resilience Act (2024/2847), nous suivons le calendrier de la plateforme unique de signalement ENISA à partir du 2026-09-11 : alerte initiale 24 h, notification complète 72 h, rapport final 14 jours après correctif disponible. Détails de triage : docs/operations/VDP_RUNBOOK.md.',
        'Attribution CVE pour les constats CVSS 4.0 ≥ 4.0 : demandée via MITRE.',
      ],
    },
    {
      id: 'hall-of-fame',
      title: '8. Hall of fame',
      paragraphs: [
        'Les chercheurs qui signalent des vulnérabilités valides et dans le périmètre sont listés ici (avec leur accord) après correction. Liste vide en pré-lancement.',
      ],
    },
  ],
};

const content: Record<Locale, SecurityContent> = { en, fr };

export function getSecurityContent(locale: Locale): SecurityContent {
  return content[locale];
}
