# Déclaration d'accessibilité — Musaium

**Statut** : v0.2 — conformité **partielle**, audit automatisé axe-core complété, passes manuelle + tests utilisateurs à venir.
**Date de rédaction** : 2026-05-13 (audit P0-2). **Mise à jour** : 2026-05-14 (clôture du lot P0 #14).
**Version applicable** : Musaium V1 (launch prévu 2026-06-01).
**Cycle de revue** : annuel, ou à chaque évolution majeure du service.

> Cette déclaration est rédigée en application de la **Directive (UE) 2019/882 du 17 avril 2019** relative aux exigences en matière d'accessibilité applicables aux produits et services (« European Accessibility Act » — EAA, opposable depuis le 28 juin 2025), de la **Loi française n° 2005-102 du 11 février 2005** (Art. 47) et du **Décret n° 2019-768 du 24 juillet 2019** relatif à l'accessibilité aux personnes handicapées des services de communication au public en ligne. Elle suit la norme harmonisée **EN 301 549 V3.2.1** alignée sur **WCAG 2.1 niveau AA**.

> **Note d'audit (2026-05-14)** : cette déclaration est rédigée à titre transparent **avant** la conduite d'un audit WCAG 2.1 AA formel par un tiers indépendant. Un balayage axe-core automatisé interne couvrant 18 routes web a été conduit le 2026-05-14 (run `2026-05-14-i18n-a11y-eaa-batch`). Le statut de conformité reste volontairement « partiel » — les outils automatisés détectent environ 20 à 50 % des problèmes. Aucune affirmation de conformité totale ne sera faite tant que les passes manuelle + tests utilisateurs (cf. § 5) n'auront pas été menées et documentées.

## Journal de version v0.2 (2026-05-14)

La clôture du run `2026-05-14-i18n-a11y-eaa-batch` a livré les remédiations suivantes :

- **Page d'enrôlement MFA** (`/admin/mfa`) — 22 chaînes anglaises codées en dur migrées vers les dictionnaires FR/EN ; conteneur QR équipé de `role="img"` + `aria-label` ; bouton « Tout copier » dont le fond passe d'`amber-500` à `amber-700` (contraste 2.45 → ≥ 4.5 : 1) (EAA Art. 4(3) ; WCAG 1.4.3 + 1.1.1 + 4.1.2 remédiés pour cette route).
- **UI mobile RTL arabe** — 28 sites de mise en page dans `museum-frontend/{features,shared/ui}/` migrés des propriétés physiques (`left`/`right`/`marginLeft`/`marginRight`/`paddingLeft`/`paddingRight`/`borderLeft`/`borderRight`/`textAlign: 'left'|'right'`) vers les équivalents logiques (`start`/`end`). Trois tests de rendu RTL ajoutés (`ChatScreen`, `HomeScreen`, `DailyArtScreen`) sous `I18nManager.forceRTL(true)` (EN 301 549 § 9.1.3.2 — Séquence Significative — renforcée pour l'arabe).
- **Couverture a11y automatisée** — `@axe-core/playwright` étendu de 6 routes (landing, privacy, support, admin/login, admin, admin/users) à 18 routes (+ /security, /accessibility, /verify-email, /confirm-email-change, /reset-password, /admin/mfa, /admin/audit-logs, /admin/tickets, /admin/support, /admin/analytics, /admin/reports, /admin/reviews). La CI échoue sur toute violation `serious` ou `critical` sous les jeux de règles WCAG 2.1 A + AA. Seuls l'iframe `/admin/ops/grafana` et le stub `/admin/users/[id]` demeurent non couverts (lots distincts).
- **Backfill `accessibilityLabel` mobile** — couverture portée au-dessus de 80 % des `Pressable` / `TouchableOpacity` (≈ 58 % selon l'audit F10 § 5).
- **Sitemap** — la route `/accessibility` est désormais émise pour toutes les locales aux fins de découvrabilité.

---

## 1. Identification du service

| Champ | Valeur |
|---|---|
| Nom du service | Musaium — assistant culturel intra-musée et hors-musée, application mobile + site web |
| Responsable / opérateur | Tim Moyence — Entrepreneur Individuel, opérant InnovMind / Musaium |
| Adresse postale | À renseigner avant publication (siège déclaré au RCS) |
| Email de contact a11y | `support@musaium.app` |
| Surfaces couvertes | Application mobile iOS + Android (`com.musaium.mobile`) ; site web `https://musaium.app` (landing + admin panel `/admin`) ; politique de confidentialité statique `https://musaium.app/privacy` |

---

## 2. État de conformité

**PARTIEL — audit WCAG 2.1 AA en cours.**

Musaium V1 n'a **pas encore** été soumis à un audit d'accessibilité formel. La présente déclaration documente honnêtement :
- les éléments de conception accessibles déjà en place (cf. § 4),
- les contenus et flux dont l'accessibilité n'est pas garantie (cf. § 3),
- le plan d'audit prévu (cf. § 5).

Aucune affirmation de conformité totale ou substantielle n'est faite à ce stade.

---

## 3. Contenus non accessibles

<!-- AUDIT WCAG 2.1 AA REQUIRED : la liste ci-dessous est issue de l'observation du code source au 2026-05-13 et de tests informels. Un audit formel auto + manuel + utilisateurs en situation de handicap est requis pour valider, compléter, ou démentir chacun des points. -->

### 3.1 Non-conformités identifiées (à confirmer par audit)

- **Flux vocaux sans alternative textuelle équivalente garantie** : le mode mains libres (STT entrant + TTS sortant) propose la transcription du LLM en parallèle, mais l'audio TTS persisté (`ChatMessage.audioUrl`) n'a pas de description audio formelle pour les non-voyants ; la transcription textuelle de l'audio sortant n'est pas systématiquement rendue accessible en lecture distincte (WCAG 1.2.1, 1.2.3). À auditer.
- **Rendu RTL (arabe) côté admin web** : le panneau admin `museum-web/src/app/[locale]/admin/*` ne déclare pas `dir="rtl"` et n'est pas testé en locale `ar`. La gestion RTL existe côté mobile (`museum-frontend/shared/i18n/rtl.ts`) mais n'a pas d'équivalent web vérifié (WCAG 1.3.2). À auditer.
- **Contraste et taille de police** : les tokens du design system (`design-system/`) suivent un ratio Inter 16 px de base mais n'ont pas été audités contre WCAG 1.4.3 (contraste minimum 4.5:1 texte normal) ni 1.4.4 (zoom 200% sans perte de contenu). À auditer.
- **Cibles tactiles mobile** : les boutons de l'interface chat sont conçus pour des cibles ≥ 44 × 44 pt (HIG Apple) mais n'ont pas été audités sur écran iPad ni avec accessibilité VoiceOver activée (WCAG 2.5.5). À auditer.
- **Disclosure IA générative** : la bannière `ai_disclosure` est rendue sur les 3 surfaces (mobile, web, privacy policy) — vérifier que les lecteurs d'écran annoncent correctement le caractère génératif des réponses (WCAG 4.1.2 + AI Act Art. 50).
- **Captures + galeries** : les photos d'œuvres prises par l'utilisateur n'ont pas d'attribut `alt` auto-généré ; le pipeline d'enrichissement IA pourrait produire un alt-text descriptif mais ce n'est pas wiré (WCAG 1.1.1). À auditer.
- **Navigation clavier (web)** : la landing Next.js et le panneau admin n'ont pas été testés avec navigation au clavier seul (Tab/Shift-Tab + Enter). Aucun skip-link n'est implémenté (WCAG 2.4.1). À auditer.
- **Sous-titres vidéo** : la landing présente des vidéos de démonstration sans sous-titres ni transcription (WCAG 1.2.2, 1.2.3). À auditer / sous-titrer avant launch ou retirer.

### 3.2 Charges disproportionnées invoquées

Aucune charge disproportionnée n'est invoquée à ce stade. Toute exemption éventuelle devra être documentée nominativement après l'audit, avec justification proportionnelle (Art. 14 EAA).

### 3.3 Contenus hors champ EAA

- Contenus tiers (images Wikidata / Wikimedia Commons / Unsplash) intégrés en lecture seule — l'accessibilité relève de leur source.
- Réponses générées par LLM tiers (OpenAI / Google) — qualité linguistique non-déterministe par nature ; un guardrail de simplicité n'est pas un substitut à l'accessibilité cognitive formelle.

---

## 4. Éléments de conception déjà accessibles (avant audit formel)

Sans préjuger de la conformité finale, les éléments suivants relèvent d'un effort d'accessibilité conscient déjà présent dans le code :

- Internationalisation 8 locales mobile (fr, en, ar, de, es, fr, it, ja, zh) avec mécanique RTL côté mobile (`museum-frontend/shared/i18n/rtl.ts` — `RTL_LOCALES = ['ar']`).
- Système d'icônes Ionicons + PNG (pas d'emoji Unicode dans les écrans — règle interne « no Unicode emoji », évite les rendus dégradés sur lecteurs d'écran).
- Mode vocal mains libres (STT + TTS) — bénéfique pour les utilisateurs malvoyants ou dyslexiques, sous réserve d'audit § 3.1.
- Disclosure générative AI Act Art. 50 visible sur les 3 surfaces.
- Police Inter 300/400/500/600/700 — lisibilité élevée.
- Design tokens centralisés (`design-system/`) — facilite une mise à niveau contraste/taille future en un seul commit.

---

## 5. Méthodologie de l'audit (à mener)

Audit WCAG 2.1 AA prévu en trois passes :

1. **Audit automatique** — outils : axe-core, Lighthouse CI (déjà en place pour la web `.github/workflows/ci-cd-web.yml`), iOS Accessibility Inspector, Android Accessibility Scanner. Status : **non démarré**.
2. **Audit manuel** — par un expert a11y externe ou un développeur formé : navigation clavier seule, VoiceOver iOS, TalkBack Android, NVDA Windows, lecture du DOM, vérification ARIA. Status : **non démarré**.
3. **Tests utilisateurs en situation de handicap** — au moins 3 panels (déficience visuelle, déficience auditive, déficience motrice). Coordination via une association partenaire (à mandater). Status : **non démarré**.

<!-- AUDIT WCAG 2.1 AA REQUIRED : aucune des 3 passes n'a été menée à la date de rédaction. La déclaration ne pourra passer de "partielle" à "totale" qu'après documentation des 3 passes + remédiation des non-conformités bloquantes. -->

---

## 6. Voies de recours et feedback

Les utilisateurs constatant un défaut d'accessibilité peuvent saisir :

- **Service support Musaium** : `support@musaium.app` — réponse cible sous 7 jours ouvrés.
- **Défenseur des droits** (France) : https://www.defenseurdesdroits.fr — recours gracieux ou contentieux en cas d'absence de réponse de l'opérateur.
- **DGCCRF** (France) : autorité de surveillance compétente au titre du Décret 2019-768 et de la transposition EAA — https://www.economie.gouv.fr/dgccrf.
- **ARCOM** : compétence subsidiaire sur les services de communication au public en ligne.

Les utilisateurs hors France doivent saisir l'autorité de surveillance de leur État membre transposant la Directive 2019/882.

---

## 7. Mise à jour de la déclaration

- Revue **annuelle** systématique au plus tard chaque 13 mai.
- Revue **événementielle** déclenchée par :
  - une refonte UI majeure d'une des 3 surfaces,
  - l'ajout d'un nouveau type de média (vidéo, AR, etc.),
  - une remontée utilisateur ou un signalement d'autorité,
  - l'introduction d'une nouvelle locale.
- Versionnage via Git — toute modification matérielle entraîne une bumpe de version (v0.1 → v0.2 → v1.0 après premier audit signé).

---

## 8. Signature

<!-- AUDIT WCAG 2.1 AA REQUIRED : aucune signature ne doit être apposée tant que l'audit § 5 n'a pas été conduit. -->

| Rôle | Nom | Date | Signature |
|---|---|---|---|
| Responsable du service | Tim Moyence (InnovMind / Musaium) | _________ | _________ |
| Auditeur a11y (externe) | _________ | _________ | _________ |

---

## 9. Références

- Directive (UE) 2019/882 (EAA) — https://eur-lex.europa.eu/eli/dir/2019/882/oj
- Loi n° 2005-102 du 11 février 2005, Art. 47.
- Décret n° 2019-768 du 24 juillet 2019.
- Norme EN 301 549 V3.2.1.
- WCAG 2.1 niveau AA — https://www.w3.org/TR/WCAG21/
- AI Act EU 2024/1689 Art. 50 — obligations de transparence sur les contenus générés.

---

**END declaration v0.2 — Audit automatisé complété ; en attente des passes manuelle + tests utilisateurs + opérateur sign-off.**
