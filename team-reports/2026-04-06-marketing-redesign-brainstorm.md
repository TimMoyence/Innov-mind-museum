# Brainstorming Report — Refonte Marketing museum-web

**Date** : 2026-04-06
**Pipeline** : Audit (4 agents paralleles)
**Agents** : design-researcher, seo-strategist, ux-architect, tech-scout
**Scope** : museum-web (Next.js 15 — site vitrine Musaium)

---

## Executive Summary

**Score actuel du site : 5.8/10** (moyenne ponderee des 4 axes)

| Axe | Score actuel | Score projete |
|-----|-------------|---------------|
| Design & Animations | 6/10 | 9/10 |
| SEO Google + IA | 5.5/10 | 8.5/10 |
| UX & Contenu | 5/10 | 9/10 |
| Technique & Performance | 7/10 | 9/10 |

Le site a un excellent design system (liquid glass, animated orbs, dark/light rhythm) mais souffre de **"tell don't show"** : il decrit les features avec du texte au lieu de les demontrer avec les 36 screenshots disponibles. Le SEO a des failles critiques (html lang, hreflang, robots.txt). Les animations sont basiques (useInView binary) vs les standards Apple/Stripe (scroll-linked, sticky sections, parallax).

**Impact projete** : passage de 5.8/10 a 8.8/10 en 5 sprints.

---

## 1. AUDIT DU SITE ACTUEL

### Ce qui marche bien

- **Design system premium** : liquid glass 3 tiers (blur 30-48px), mesh gradient (4 radial gradients), animated orbs (4 avec stagger CSS). Production-quality.
- **PhoneMockup.tsx** : 3D tilt au mouse move, proportions iPhone realistes (19.5:9), Dynamic Island, glass shine. Composant solide.
- **Dark/light alternance** : rythme visuel correct qui evite la monotonie.
- **AnimatedSection.tsx** : abstraction propre supportant slide/scale/fade + stagger children avec spring physics.
- **i18n complet** : FR/EN avec dictionaries JSON, routing [locale]/, middleware auto-redirect.
- **JSON-LD MobileApplication** : schema de base present.
- **Semantic HTML** : landmarks corrects (header/main/footer/nav/section), aria-hidden sur decoratifs.

### Ce qui manque vs Apple/Stripe/Revolut

#### Cross-valide par 2+ agents (severite elevee)

| Manque | Agents | Severite |
|--------|--------|----------|
| **Zero social proof** — pas de temoignages, stats, logos, ratings store | design + ux | CRITIQUE |
| **Store buttons morts** — `href="#"` | design + ux | CRITIQUE |
| **html lang hardcode "fr"** — pages EN ont lang="fr" | seo | CRITIQUE |
| **Pas de hreflang/canonical dans head** | seo | CRITIQUE |
| **Pas de scroll-linked animations** — tout est useInView binary | design + tech | HAUT |
| **36 screenshots sous-exploites** — seuls 3 sont utilises | ux + design | HAUT |
| **Feature grid uniforme** — toutes les cartes meme taille, pas de bento | design + tech | HAUT |
| **Reviews section vide** — contre-productive, signale l'absence de social proof | ux + design | HAUT |
| **robots.txt minimal** — pas de disallow admin, pas de directives AI bots | seo | HAUT |
| **Pas de FAQ sur landing** — mauvais pour SEO et conversion | ux + seo | MOYEN |
| **Footer trop minimal** — 2 liens vs mega-footer Stripe | design + ux | MOYEN |
| **Pas de useReducedMotion** — gap accessibilite | tech | MOYEN |

---

## 2. NOUVELLE ARCHITECTURE DE PAGE

### Page actuelle (6 sections)

```
1. Hero (dark) → 2. How It Works (light) → 3. App Showcase (dark)
→ 4. Feature Grid (light) → 5. Reviews (dark) → 6. Download CTA (light)
```

### Page proposee (11 sections)

```
 1. Hero (dark)                    ← GARDER — enrichir parallax + scroll indicator
 2. How It Works (light)           ← GARDER — animer la ligne SVG au scroll
 3. Photographiez, Comprenez (dark)← NOUVELLE — showcase chat IA avec screenshots
 4. Trouvez les musees (light)     ← NOUVELLE — showcase carte interactive
 5. Votre historique (dark)        ← NOUVELLE — showcase dashboard
 6. Multi-device (light)           ← NOUVELLE — iPhone + iPad + Android cote a cote
 7. Feature Grid (light mesh)      ← GARDER — convertir en bento grid
 8. IA Responsable (dark)          ← NOUVELLE — compliance + confiance
 9. Statistiques (light)           ← NOUVELLE — chiffres animes (remplace Reviews)
10. FAQ (light)                    ← NOUVELLE — accordeon + schema FAQPage
11. Download CTA (light gradient)  ← GARDER — ajouter QR code + vrais liens store
```

**Sections supprimees** :
- **App Showcase** (Section 3 actuelle) → redondante avec les nouvelles sections "Photographiez", "Maps" et "Multi-device"
- **Reviews** (Section 5 actuelle) → contre-productive sans vrais temoignages. Remplacee par "Statistiques"

---

## 3. DETAIL DES NOUVELLES SECTIONS

### Section 3 — "Photographiez. Comprenez." (AI Chat Showcase)

| Attribut | Valeur |
|----------|--------|
| **Pattern** | Dark gradient, split 50/50, texte gauche + device droite |
| **Screenshot** | `iPhone 16 Pro Max - chatSessionWithDiscussion.png` (Venus de Milo + Radeau de la Meduse) |
| **Animation** | PhoneMockup floating, rotateY:3deg, scroll-driven entrance |

**Contenu FR** :
> **Photographiez. Comprenez.**
> Pointez votre camera vers une oeuvre. En quelques secondes, l'IA vous revele son histoire, sa technique et son contexte culturel.
> - Identification instantanee par vision artificielle
> - Reponses detaillees avec sources verifiees
> - Conversation naturelle — posez vos questions de suivi

**Contenu EN** :
> **Point. Discover. Understand.**
> Aim your camera at any artwork. Within seconds, AI reveals its history, technique, and cultural significance.
> - Instant identification through computer vision
> - Detailed answers backed by verified sources
> - Natural conversation — ask follow-up questions

---

### Section 4 — "Tous les musees. Autour de vous." (Maps Showcase)

| Attribut | Valeur |
|----------|--------|
| **Pattern** | Light, split 50/50 inverse (device gauche, texte droite) |
| **Screenshots** | `iPhone 16 Pro Max -maps.png` (SF) + `Android - Maps.png` (Bordeaux) — 2 phones cote a cote |
| **Animation** | Slide-in from left, legere rotation opposee entre les 2 phones |

**Contenu FR** :
> **Tous les musees. Autour de vous.**
> Ou que vous soyez, Musaium localise les musees a proximite sur une carte interactive. De San Francisco a Bordeaux, votre guide vous accompagne partout.

**Contenu EN** :
> **Every museum. Right around you.**
> Wherever you are, Musaium locates nearby museums on an interactive map. From San Francisco to Bordeaux, your guide travels with you.

---

### Section 5 — "Chaque visite. Chaque decouverte." (Dashboard)

| Attribut | Valeur |
|----------|--------|
| **Pattern** | Dark gradient, device centre, orbes gold subtils |
| **Screenshot** | `iPhone 16 Pro Max - dashboard.png` |
| **Animation** | PhoneMockup floating au centre, scale 1.0 |

**Contenu FR** :
> **Chaque visite. Chaque decouverte.**
> Retrouvez toutes vos sessions de musee, filtrez par date, sauvegardez vos favoris. Votre journal culturel personnel, toujours accessible.

**Contenu EN** :
> **Every visit. Every discovery.**
> Find all your museum sessions, filter by date, save your favorites. Your personal cultural journal, always accessible.

---

### Section 6 — "Un compagnon sur chaque ecran." (Multi-device)

| Attribut | Valeur |
|----------|--------|
| **Pattern** | Light gradient blanc → primary-50, 3 devices alignes |
| **Screenshots** | `iPhone 16 Pro Max home.png` + `iPad Pro 13-home.png` + `Android - home.png` |
| **Animation** | Stagger entrance, iPad en arriere-plan (scale plus grand), phones au premier plan |

**Contenu FR** :
> **Un compagnon sur chaque ecran.**
> iPhone, iPad, Android — Musaium s'adapte nativement a votre appareil pour une experience optimale, ou que vous soyez.

**Contenu EN** :
> **A companion on every screen.**
> iPhone, iPad, Android — Musaium adapts natively to your device for an optimal experience, wherever you are.

---

### Section 8 — "IA transparente. Donnees protegees." (Compliance)

| Attribut | Valeur |
|----------|--------|
| **Pattern** | Dark gradient sobre, split 50/50 texte + device |
| **Screenshot** | `iPhone 16 Pro Max IA generated compliance.png` |
| **Animation** | Sobre, pas de rotation — ton de confiance |

**Contenu FR** :
> **IA transparente. Donnees protegees.**
> Musaium vous informe clairement que les reponses sont generees par IA. Vos photos restent privees, vos donnees ne sont jamais partagees.
> - Disclaimer IA affiche avant chaque session
> - Donnees traitees conformement a notre politique de confidentialite
> - Signalez toute reponse problematique en un tap

**Contenu EN** :
> **Transparent AI. Protected data.**
> Musaium clearly discloses that responses are AI-generated. Your photos stay private, your data is never shared.

---

### Section 9 — "Musaium en chiffres" (Stats)

| Attribut | Valeur |
|----------|--------|
| **Pattern** | Light, 4 colonnes centrees, chiffres animes CountUp |
| **Animation** | AnimatedCounter au scroll avec useSpring |

| Chiffre | Label FR | Label EN |
|---------|----------|----------|
| 3 | Modes d'interaction | Interaction modes |
| 10+ | Langues supportees | Languages supported |
| 3 | Plateformes | Platforms |
| 100% | Gratuit | Free |

---

### Section 10 — FAQ (Accordeon)

| Attribut | Valeur |
|----------|--------|
| **Pattern** | Light, colonne centree max-w-3xl, accordeon style Apple |
| **Schema** | FAQPage JSON-LD pour SEO |

7 questions FR/EN couvrant : gratuite, compatibilite musees, protection donnees, contact support, fiabilite IA, connexion internet, couverture geographique.

---

## 4. STRATEGIE SEO

### 4.1 SEO Google — Corrections P0 (CRITIQUES)

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 1 | **Fix `<html lang>` dynamique** — deplacer html/body dans locale layout | CRITIQUE | Faible |
| 2 | **Ajouter hreflang + canonical** dans generateMetadata | CRITIQUE | Faible |
| 3 | **Corriger redirect middleware en 301** (au lieu de 302) | HAUT | Trivial |
| 4 | **Disallow admin/reset-password** dans robots.txt | HAUT | Trivial |

### 4.2 SEO Google — P1

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 5 | **Sitemap dynamique** via `sitemap.ts` (+ supprimer sitemap.xml statique) | HAUT | Faible |
| 6 | **Enrichir JSON-LD MobileApplication** : aggregateRating, screenshots, downloadUrl, featureList | HAUT | Moyen |
| 7 | **Ajouter FAQPage JSON-LD** sur landing (section FAQ) | HAUT | Faible |
| 8 | **Ajouter Organization + WebSite JSON-LD** dans root layout | MOYEN | Faible |
| 9 | **Configurer images.formats: ['image/avif', 'image/webp']** dans next.config.ts | MOYEN | Trivial |

### 4.3 SEO IA — llms.txt + AI Crawlers

**Creer `public/llms.txt`** contenant :
- Description de l'app (nom, categorie, prix, plateformes, langues)
- Pages cles avec URLs
- FAQ complete
- Liens store

**Mettre a jour `robots.txt`** :
- Autoriser GPTBot, ClaudeBot, PerplexityBot, Applebot-Extended, Google-Extended sur contenu public
- Bloquer Bytespider, CCBot (crawl agressif, peu de retour)
- Disallow admin + API pour tous

### 4.4 Meta Optimization

**Landing FR** : `"Musaium — Guide de musee IA | Reconnaissance d'oeuvres et chat intelligent"` (73 chars)
**Landing EN** : `"Musaium — AI Museum Guide | Artwork Recognition & Smart Chat"` (61 chars)
**Descriptions** : 140-158 chars, ciblee sur les requetes "museum AI app", "artwork recognition app"

---

## 5. PATTERNS D'ANIMATION A IMPLEMENTER

### Priorite P0 (Accessibilite)

| Pattern | Effort | Code |
|---------|--------|------|
| `useReducedMotion` support global | S | Wrap toutes les animations, reduced = opacity instant |

### Priorite P1 (Transformatif — Apple-like)

| Pattern | Effort | Applicable a |
|---------|--------|-------------|
| **Sticky Scroll Section** | L | Remplace DeviceShowcase — screenshots cyclent dans le phone au scroll |
| **Parallax Layers (Hero)** | S | Orbes bg + phone mid + texte fg, lie au scrollY |
| **Text Reveal (word-by-word)** | S | Titres de section — chaque mot apparait avec blur |
| **Blur-Scale entrance** | S | Nouveau variant AnimatedSection — scale(0.95) + blur(8px) → 1.0 + 0px |

### Priorite P2 (Polish)

| Pattern | Effort | Applicable a |
|---------|--------|-------------|
| **Animated Counter** | M | Section Statistiques — numbers count up on scroll |
| **Scroll Progress Bar** | S | Navigation — barre de progression en haut |
| **Marquee / Ticker** | S | Social proof — "used in 50+ museums" |
| **Magnetic Button** | S | CTA hero et download — bouton suit le curseur |

### Priorite P3 (Finition)

| Pattern | Effort | Applicable a |
|---------|--------|-------------|
| **3D Tilt Cards** | S | Feature cards — tilt au hover |
| **Animated Mesh Gradient** | M | Hero et Feature Grid — gradient CSS anime |
| **SVG Line Draw** | M | How It Works — ligne se dessine au scroll |

### Composants a creer

| Composant | Purpose |
|-----------|---------|
| `StickyScrollSection.tsx` | Section sticky Apple-style |
| `TextReveal.tsx` | Texte mot par mot avec blur |
| `AnimatedCounter.tsx` | Compteur anime au scroll |
| `Marquee.tsx` | Ticker horizontal infini |
| `MagneticButton.tsx` | Bouton magnetique CTA |
| `ScrollProgress.tsx` | Barre de progression scroll |
| `TiltCard.tsx` | Wrapper 3D tilt pour cartes |

### Composants a modifier

| Composant | Modifications |
|-----------|--------------|
| `AnimatedSection.tsx` | + variant 'blur-scale', + useReducedMotion, + threshold prop |
| `PhoneMockup.tsx` | + scrollProgress prop, + screenshot carousel mode |
| `HeroAnimation.tsx` | + parallax layers, ralentir float (1.67s → 5s) |
| `Header.tsx` | + header transparency scroll-linked |
| `Footer.tsx` | + 4 colonnes (Product, Resources, Legal, Social) |
| `globals.css` | + @keyframes mesh-shift, + reduced-motion overrides |

---

## 6. STRATEGIE SCREENSHOTS

| Section | Screenshot principal | Device | Screenshot secondaire | Device |
|---------|---------------------|--------|----------------------|--------|
| Hero | (Lottie animation existante) | — | — | — |
| AI Chat | `chatSessionWithDiscussion.png` | iPhone | `ChatSessionWithMessages.png` | iPad |
| Maps | `maps.png` | iPhone (SF) | `Maps.png` | Android (Bordeaux) |
| Dashboard | `dashboard.png` | iPhone | — | — |
| Multi-device | `home.png` | iPhone | `home.png` + `home.png` | iPad + Android |
| IA Responsable | `IA generated compliance.png` | iPhone | `IAGEneratedCompliance.png` | Android |

**Regles** :
- iPhone pour hero/features principales (rendu le plus premium)
- iPad pour montrer le detail (ecran plus grand = plus de contenu visible)
- Android pour la diversite (rassure les utilisateurs Android)
- Toujours dans PhoneMockup — jamais de screenshot brut
- Privilegier screenshots avec contenu reel (Venus de Milo, Gericault) vs ecrans vides

---

## 7. PLAN D'IMPLEMENTATION — 5 Sprints

### Sprint 1 — Fondations SEO + Fixes critiques (1 jour)
```
[ ] Fix <html lang> dynamique (root → locale layout)
[ ] Ajouter hreflang + canonical dans generateMetadata
[ ] Corriger middleware redirect 302 → 301
[ ] Mettre a jour robots.txt (disallow admin, directives AI bots)
[ ] Creer sitemap.ts dynamique
[ ] Ajouter images.formats dans next.config.ts
[ ] Creer llms.txt
[ ] Enrichir JSON-LD MobileApplication
[ ] Ajouter Organization + WebSite JSON-LD
[ ] Ajouter useReducedMotion global
[ ] Ralentir HeroAnimation float (1.67s → 5s)
[ ] Ajouter scroll indicator au hero (chevron anime)
```

### Sprint 2 — Nouvelles sections "Show don't tell" (2-3 jours)
```
[ ] Creer TextReveal.tsx
[ ] Creer section "Photographiez, Comprenez" (AI Chat showcase)
[ ] Creer section "Tous les musees" (Maps showcase)
[ ] Creer section "Chaque visite" (Dashboard showcase)
[ ] Creer section "Multi-device" (iPhone + iPad + Android)
[ ] Creer section "IA Responsable" (Compliance)
[ ] Ajouter contenu FR/EN dans les dictionaries
[ ] Supprimer section Reviews vide
[ ] Supprimer section App Showcase (remplacee)
```

### Sprint 3 — Animations premium (2 jours)
```
[ ] Creer StickyScrollSection.tsx (Apple-style)
[ ] Convertir "Photographiez" ou "Multi-device" en sticky scroll
[ ] Ajouter parallax layers au Hero
[ ] Ajouter blur-scale variant a AnimatedSection
[ ] Animer la ligne SVG "How It Works" au scroll
[ ] Creer ScrollProgress.tsx
[ ] Implementer header transparency scroll-linked
```

### Sprint 4 — Social proof + SEO contenu (1-2 jours)
```
[ ] Creer AnimatedCounter.tsx
[ ] Creer section Statistiques avec counters animes
[ ] Creer section FAQ avec accordeon + FAQPage JSON-LD
[ ] Creer Marquee.tsx (ticker social proof)
[ ] Enrichir footer (4 colonnes)
[ ] Convertir feature grid en bento layout
[ ] Ajouter 6 FAQ supplementaires dans dictionaries
[ ] Optimiser meta descriptions toutes pages
```

### Sprint 5 — Polish + Performance (1 jour)
```
[ ] Creer MagneticButton.tsx (CTA hero + download)
[ ] Creer TiltCard.tsx (feature cards)
[ ] Ajouter animated mesh gradient
[ ] Wirer vrais liens App Store / Google Play
[ ] Creer image OG 1200x630
[ ] Ajouter Twitter Card meta tags
[ ] Lighthouse audit + optimisations CWV
[ ] Test reduced motion
[ ] Test responsive mobile
```

---

## 8. DECISIONS CLES

| Decision | Justification |
|----------|---------------|
| Supprimer Reviews | Section vide = pire que pas de section. Re-introduire avec vrais avis store |
| Supprimer App Showcase actuel | Redondant avec les 5 nouvelles sections qui montrent chaque feature en contexte |
| CSS mesh gradient (pas WebGL) | Suffisant pour 1-2 sections, WebGL surdimensionne pour le scope actuel |
| Pas de video hero (pour l'instant) | Effort L + production necessaire. Les screenshots reels dans PhoneMockup sont suffisants pour la V1 de la refonte |
| llms.txt a creer maintenant | Standard emergent mais en croissance rapide. Faible effort, potentiel SEO IA eleve |
| Sticky scroll comme piece maitresse | Le pattern #1 qui differencie Apple/Stripe des sites classiques. Effort L mais impact transformatif |

---

*Rapport genere par team marketing-redesign-brainstorm — 4 agents opus, pipeline audit*
