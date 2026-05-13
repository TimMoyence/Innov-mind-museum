# R21 — CDN strategy for Musaium (2026-05-12)

> **Scope** : audit CDN options pour Musaium (mobile 100k MAU + landing/admin 100k visitors/mois) actuellement servi direct depuis OVH VPS (nginx + Node + S3-compat storage), avec un focus sur Cloudflare Free + R2 + Images.
>
> **Honesty UFR-013** : Toutes les valeurs prix/limites en provenance des pages officielles éditeurs ou de blogs récents (cf. Sources). Verdict reposant sur le contexte existant (R8 scaling, R9 image pipeline, R18 web SEO, `chat-module.ts`, `infra/nginx/conf.d/grafana.conf`, `docs/OPS_DEPLOYMENT.md`).

---

## TL;DR

1. **À adopter avant le launch 2026-06-01 : Cloudflare Free devant OVH** (DNS proxy orange-cloud + Cache Rules + Always Use HTTPS + Full(Strict) avec origin certificate). 0 €/mois, ~1-2 h setup, rollback DNS instantané. Bénéfices immédiats : DDoS L3/L4/L7 unmetered, rate limiting natif (sans add-on $5/M depuis 2024), WAF 5 custom rules, TLS edge, offload bandwidth statique landing + `/_next/static` + media chat.
2. **À planifier V1.1 (≥ 5 000 images uploadées ou ≥ 500k/mois) : migration S3 OVH-compat → Cloudflare R2** (zero egress, $0.015/GB/mois, S3 API compatible donc swap d'endpoint dans `chat-module.ts:356-372`). 1-2 jours dev. Économies à partir de ~50 GB egress/mois.
3. **Image transformations** : démarrer sans CDN d'images (Sharp côté backend, déjà fait). Quand le coût CPU encoder backend devient un bottleneck (~5 000 visiteur-uploads × 3 variants / mois ≈ 15 000 transforms), basculer sur **Cloudflare Images en mode "external origin"** (5 000 free + $0.50/1k) ou **BunnyCDN Optimizer flat $9.50/mo** (unlimited).
4. **Ne PAS adopter** : Fastly ($50/mois min, dev-first, overkill), AWS CloudFront ($0.085/GB egress après 1 TB free tier mais lock-in AWS-stack), Vercel Edge Network (lock-in et coûts cachés function invocations + image opt à 100k+ visitors), Cloudinary (25 credits free seulement, scale économiquement explosif), imgix (modèle pricing crédit + min $500/mois en pratique).
5. **GDPR/EU CRA** : Cloudflare est ISO 27701 + EU Cloud Code of Conduct + EU-US DPF certified mais entreprise US (CLOUD Act applicable) → adapté pour un B2C non-sensible avec DPA en place. **BunnyCDN** (Slovenia/EU-native, ISO 27001 en cours, EU-only routing 1-click) est le plus simple pour un argument "data stays EU" si Musaium revend en B2B musées institutionnels.
6. **Cache strategy retenue** :
   - Landing/static (`/_next/static/*`, fonts, public images) : `Cache-Control: public, max-age=31536000, immutable` (1 an, content-hashed URLs Next.js).
   - Public artwork images : `public, max-age=2592000, stale-while-revalidate=86400` (30 j edge, SWR 24 h).
   - User-uploaded chat images : signed URL avec `private, max-age=3600` (1 h, ne pas cache CDN sauf si Cloudflare R2 + custom domain).
   - API JSON responses : `Cache-Control: no-cache, must-revalidate` + `ETag` (revalidation conditionnelle 304). Cloudflare bypass par défaut sur ces réponses.
7. **DDoS protection** : Cloudflare Free L3/L4/L7 unmetered + 5 WAF custom rules suffisent au launch. Rate limiting edge sur `/api/auth/*` et `/api/chat/*`. Garder fail2ban local sur le VPS pour origin SSH + nginx 4xx flooders **mais sur les vraies IPs via `CF-Connecting-IP`** (cf. piège réel-IP §9.2).

**Verdict global** : **Cloudflare Free immédiatement, R2 quand le coût egress OVH dépasse $30/mois, Cloudflare Images en mode external origin (R2 ou OVH) si transforms restent < 5k/mois sinon Bunny Optimizer.**

---

## 1. Cloudflare Free + R2 + Images (2026)

### 1.1 Cloudflare Free — features pertinentes Musaium

D'après [Cloudflare Free Plan Overview](https://www.cloudflare.com/plans/free/) + [Cloudflare plans](https://www.cloudflare.com/plans/) (2026) :

| Feature | Free | Commentaire Musaium |
|---|---|---|
| **CDN bandwidth proxied** | Illimité | Toute la bande passante landing/media/`/_next/static` offload OVH |
| **DDoS protection L3/L4/L7** | Unmetered, always on | Couvre attaques volumetric + HTTP flood |
| **TLS edge (Universal SSL)** | Free | Cert auto Cloudflare devant ; on garde Let's Encrypt sur origin |
| **WAF Custom Rules** | 5 rules | Suffit pour `/api/auth/login` rate limit, blacklist UA, geo-block soft |
| **Rate Limiting** | Inclus sans add-on | Depuis [blog Cloudflare unmetered rate-limiting](https://blog.cloudflare.com/unmetered-ratelimiting/) plus de $5/M requests |
| **Cache Rules** | Inclus | Remplace Page Rules ([deprecated](https://blog.cloudflare.com/future-of-page-rules/) — EOL annoncé) |
| **Transform Rules** | Inclus | Réécrire headers, e.g. forcer `Cache-Control` |
| **Bot Fight Mode** | Inclus | Bloque bots connus, anti-scraping basique |
| **Analytics 24 h window** | Inclus | Cache analytics Pro = au-delà 24 h |
| **Image Transformations (5 000/mois free)** | Inclus | 5k transforms gratuits/mois, puis $0.50/1k. Permet de tester sans plan payant |
| **Argo Smart Routing** | ❌ Pro+ | $5/mo + $0.10/GB. Pas indispensable au launch |
| **Polish (auto image opt JPEG/WebP)** | ❌ Pro+ | Plan $20/mois |
| **Custom WAF Managed Ruleset** | ❌ Pro+ | OWASP managed rules = Pro |

> **Note importante** : Mirage (image lazy-loading auto) a été déprécié late 2025 selon [Cloudflare Pricing 2026 — blazingcdn](https://blog.blazingcdn.com/en-us/cloudflares-pricing-plans-a-comprehensive-guide). On migre les image opts via Polish (Pro) ou Cloudflare Images (standalone).

### 1.2 Cloudflare R2 — pricing zero-egress

D'après [Cloudflare R2 pricing docs](https://developers.cloudflare.com/r2/pricing/) (2026) + [Cloudflare R2 calculator](https://r2-calculator.cloudflare.com/) :

| Métrique | Coût | Free tier |
|---|---|---|
| Storage (Standard) | **$0.015/GB/mois** | **10 GB/mois** |
| Class A operations (PUT, COPY, LIST, multipart init) | $4.50/M ops | **1 M ops/mois** |
| Class B operations (GET, HEAD) | $0.36/M ops | **10 M ops/mois** |
| Egress (toute origine, S3 API, Workers, r2.dev, custom domain) | **$0/GB** | Illimité |
| Infrequent Access storage | $0.01/GB + $0.01/GB retrieve | Pas de free tier IA |

**Calcul Musaium hypothétique** (cf. R9 §8) :

- **Année 1 launch** : ~10 000 chat-image uploads × 200 KB = **2 GB**, 200 000 reads/mois (5× write/read) → **Free tier (10 GB stockage + 10 M GET-ops + 0 egress)** absorbe tout. **Coût : $0/mois**.
- **Steady-state 100 k MAU année 2** : ~100 000 uploads/mois × 200 KB = 20 GB/mois cumul, 500 GB stockage à 30 mois → $0.015 × 500 = **$7.50/mo stockage** + $0 egress + ~5 M Class A ops/mois ($4.50 × 4 = $18/mo) = **~$25/mo**. Hors free tier.
- **Si on partait sur AWS S3 standard** mêmes volumes : storage $11.50/mo + egress 500 GB × $0.085 (Cf [LeanOps S3 pricing](https://leanopstech.com/blog/aws-data-transfer-pricing-2026/)) = ~$42/mo egress seul → **$54/mo total**. **R2 économise ~$30/mo dès year 2**, et ratio explose au scale (cf. [Vantage R2 vs S3](https://www.vantage.sh/blog/cloudflare-r2-aws-s3-comparison) : "100 TB d'egress = $4 600 S3 vs $1 500 R2").

⚠️ **Caveat opérationnel** ([LeanOps R2 pricing 2026](https://leanopstech.com/blog/cloudflare-r2-pricing-2026/)) : "Class A operations at $4.50/M can be a concern—analysis of 47 real R2 bills found the break-even point where R2 actually costs more than S3 in certain scenarios." → si Musaium fait **beaucoup de PUT/LIST par petit objet** (e.g. tile pyramid, thumbnails écrits chaque request), surveiller. Pour 100 k MAU avec ~1 image / 10 visites + variants pré-générés batch, OK.

### 1.3 Cloudflare Images — pricing en mode standalone

D'après [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/) + [theimagecdn 2026](https://theimagecdn.com/docs/cloudflare-images-pricing) :

| Métrique | Coût | Free |
|---|---|---|
| **Transformations** | $0.50 / 1 000 | **5 000/mois** |
| **Stored images** (Cloudflare bucket) | $5 / 100 000 | — |
| **Delivered images** (Cloudflare bucket) | $1 / 100 000 | — |

> **Distinction critique** ([theimagecdn](https://theimagecdn.com/docs/cloudflare-images-pricing)) : Storage et delivery fees s'appliquent **uniquement** quand on stocke dans le bucket Cloudflare Images. **External origin** (R2, S3, OVH backend) = **on paie SEULEMENT le per-transform rate**. Donc pour Musaium qui a déjà un object store, on garde R2 et on appelle les transforms via `/cdn-cgi/image/...` ⇒ $0.50/1k au-delà de 5k transforms gratuits, **sans frais storage/delivery additionnels**.

**Modèle Musaium V1 launch** :

- Catalog statique (artworks pré-curated) : ~500 oeuvres × 3 sizes (mobile 800w, tablet 1200w, desktop 1600w) = 1 500 variants pré-générés (batch build). **0 transforms runtime** si bien architecturé.
- User-uploaded chat images : Sharp re-encode côté backend (AVIF, déjà fait — cf. R9). Pas besoin de transform Cloudflare runtime.
- **Conséquence** : on reste sous les 5 000 transforms/mois **gratuits** longtemps. Coût Images = **$0/mois** au launch.

### 1.4 Intégration avec OVH origin — pattern recommandé

```
                ┌─────────────────────────────────────────┐
                │ Cloudflare Edge (Free plan)             │
                │ • DNS proxy orange-cloud                │
                │ • TLS termination edge                  │
                │ • DDoS L3/L4/L7 + rate limit            │
                │ • Cache Rules                           │
                │ • WAF 5 custom rules                    │
                └────────────────┬────────────────────────┘
                                 │ origin pull HTTPS (Full Strict)
                                 │ avec Cloudflare Origin Cert (15 yrs)
                                 ▼
                ┌─────────────────────────────────────────┐
                │ nginx (Docker, OVH VPS)                 │
                │ • Validate Cloudflare cert SNI          │
                │ • Restore real IP via CF-Connecting-IP  │
                │ • Reverse proxy → Node :3000 / :3001    │
                └────┬────────────────┬───────────────────┘
                     │                │
                     ▼                ▼
              museum-backend    museum-web (Next.js)
                     │
                     ▼
              S3-compat (OVH) → migrer Cloudflare R2 quand pertinent
```

**Précisions clés** :

- **TLS edge → origin** : SSL/TLS mode = **Full (Strict)** ([Cloudflare SSL modes doc](https://community.cloudflare.com/t/reverse-proxy-via-nginx-cloudflare-ssl/352985)). On garde le Let's Encrypt actuel sur nginx (déjà géré par `tls-renewal.yml` cron) — Cloudflare valide la chain. Alternative : Cloudflare Origin Certificates ([Cloudflare Origin Cert docs](https://kb.virtubox.net/knowledgebase/cloudflare-ssl-origin-certificates-nginx/)) valables 15 ans, mais perd le bénéfice cross-CDN si on swap.
- **Real client IP** : nginx config doit ajouter `set_real_ip_from <CF IPv4/6 ranges>` + `real_ip_header CF-Connecting-IP` sinon tous les logs et rate-limits backend voient l'IP Cloudflare. Cf. piège §9.2.
- **Authenticated Origin Pulls** ([Cloudflare docs](https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/)) : bonus sécurité, le origin n'accepte QUE les requêtes signées par Cloudflare. Pré-requis = origin cert client side. À planifier post-launch.

---

## 2. BunnyCDN 2026 — alternative EU-native

### 2.1 Pricing

D'après [bunny.net pricing](https://bunny.net/pricing/) + [bunny.net storage](https://bunny.net/pricing/storage/) + [bunny.net Optimizer](https://bunny.net/pricing/optimizer/) (2026) :

| Service | Coût | Notes |
|---|---|---|
| **CDN Standard Network** (EU/NA) | **$0.01/GB** | Min $1/mois zone |
| **CDN Volume Network** (EU/NA) | **$0.005/GB** | Lowest tier, fewer POPs |
| **Bunny Storage** | $0.01-0.02/GB/mo | Min $0/mois (pas $1) |
| **Bunny Optimizer** | **$9.50/mo flat per site** | Unlimited transforms/requests |
| **Stream (video)** | $0.005/min encoding + $0.01/GB streaming | Hors scope Musaium |

**Calcul Musaium hypothétique** (100k MAU, ~500 GB/mois egress combined landing + media) :

- CDN Standard EU : 500 × $0.01 = **$5/mo** + min zone $1 × 3 zones (api, web, media) = $3 → **~$8/mo**.
- Bunny Storage 500 GB : 500 × $0.02 = **$10/mo**.
- Bunny Optimizer flat : **$9.50/mo** (si on transforme).
- **Total ~$30/mo**.

vs. **Cloudflare Free** : $0 sur landing + media tant que sous 5k transforms/mois. **Pour V1 launch Musaium, Cloudflare Free domine économiquement**.

### 2.2 Performance

D'après [Bunny.net vs Cloudflare 2026 — kunalganglani](https://www.kunalganglani.com/blog/bunnynet-vs-cloudflare-2026) + [Affinco BunnyCDN review](https://affinco.com/bunny-net-review/) + [bitdoze 2026](https://www.bitdoze.com/bunny-net-review/) :

- **119+ edge POPs** (vs Cloudflare 330+), **25 ms latence moyenne globale**.
- "Bunny.net has enterprise-level performance at one-fourth the cost of competitors" — particulièrement EU-strong (siège Slovenie, presence dense en Europe centrale et orientale).
- **AVIF non-supporté** ([bunny.net blog](https://bunny.net/blog/lets-talk-avif-and-why-we-are-not-adding-support-just-yet/) — décision délibérée 2024-2026) → WebP only. Si Musaium veut AVIF (déjà visé dans R9 §312), c'est un **showstopper** pour Bunny Optimizer.
- **EU-only routing** ([bunny.net blog GDPR routing](https://bunny.net/blog/introducing-routing-filters-gdpr-friendly-eu-only-cdn-routing/)) : 1-click toggle qui force tout le trafic à rester dans des POPs UE. Win GDPR pour B2B musées institutionnels.

### 2.3 Verdict Bunny pour Musaium

- **Plus** : pricing simple, GDPR/EU-native, flat $9.50 image opt, EU-only routing toggle.
- **Moins** : pas d'AVIF (vs R9 stratégie AVIF canonical), moins de POPs en Asie/Amériques, pas de free tier comparable.
- **Décision** : **alternative à conserver dans le tiroir** si Cloudflare a un incident GDPR / CLOUD Act / change drastiquement ses CG, ou si un musée B2B exige contractuellement "data stays EU" sans nuance Cloudflare ISO 27701. Pas le choix pour le launch.

---

## 3. Fastly 2026 — pourquoi NON

D'après [Fastly pricing](https://www.fastly.com/pricing) + [CloudFront vs Fastly Vantage](https://www.vantage.sh/blog/cloudfront-fastly-cdn-comparison) + [Fastly Compute pricing srvrlss](https://www.srvrlss.io/provider/fastly/) (2026) :

| Métrique | Valeur |
|---|---|
| **Free trial** | $50 credits (one-time, NOT recurring free tier) |
| **Bandwidth** | $0.12/GB (start), ~30% discount après 10 TB |
| **Requests** | $0.0075 / 10k requests |
| **Minimum monthly spend** | **$50/mois** (pay-as-you-go floor) |
| **Compute@Edge** | Request-based + ms execution time, $50 trial credit |

**Verdict pour Musaium** : 
- **Show-stopper** : $50/mois minimum vs Cloudflare Free $0. Pas justifiable au launch.
- **Use case Fastly** : médias temps-réel (live streaming, sports betting), édition logique edge (instant purge < 150 ms vs Cloudflare ~30 s), compliance entreprise. Aucun de ces use cases pour Musaium V1.
- Fastly devient pertinent à **≥ 10 TB/mois bandwidth** ou si Musaium pivote vers du contenu live-streamed (V1.2+).

---

## 4. AWS CloudFront + S3 — enterprise option

D'après [AWS CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/) + [LeanOps AWS data transfer 2026](https://leanopstech.com/blog/aws-data-transfer-pricing-2026/) + [Vantage CloudFront vs Fastly](https://www.vantage.sh/blog/cloudfront-fastly-cdn-comparison) :

### 4.1 Pricing CloudFront 2026

| Métrique | Coût | Free tier |
|---|---|---|
| **Data transfer out (NA/EU)** | **$0.085/GB** (next 9 TB) → $0.080/GB → $0.060/GB → $0.040/GB | **1 TB/mois** perpetual free tier |
| **HTTPS requests** | $0.0100 / 10k (HTTP) → $0.0120 / 10k (HTTPS) | **10 M/mois** perpetual free tier |
| **CloudFront Flat-rate Free** | 1 M requests + 100 GB included | Includes Shield Standard + R53 DNS |
| **S3 → CloudFront transfer** | $0 (same AWS account) | — |
| **S3 egress direct** (sans CloudFront) | $0.09/GB après 100 GB | 100 GB/mois free across services |

### 4.2 Calcul Musaium 100 k MAU

Hypothèse : 500 GB/mois landing + media bandwidth.

- 1ère TB free (100% Musaium absorbed) ⇒ **$0/mois CloudFront bandwidth**.
- À 2 TB/mois (scale year 2) : (2 TB - 1 TB free) × $0.085 = **$87/mo**.
- À 10 TB/mois (post-pivot B2B) : 9 × $0.085 = **$765/mo** ⇒ se rapproche de plans flat-rate $50 ou Reserved Capacity.
- S3 storage 500 GB = $11.50 + $0 transfer S3→CF.

**Avantage** : "perpetual free tier" 1 TB/mois utile pour soft launch. CDN Edge AWS-native, intégration EventBridge / Lambda@Edge possible.

**Désavantage** :
- Lock-in AWS. Musaium ne sera **probablement jamais AWS-only** (origin OVH).
- Au-dessus de 1 TB free, CloudFront est ~10× plus cher que Cloudflare proxied (Cloudflare = $0 unlimited).
- WAF AWS = $5/mois + $1/M requests rule eval (cher à scale).
- Pas de plan free permanent au-delà du 1 TB.

**Verdict** : **NON pour Musaium**. Pertinent uniquement si Musaium migrait son backend vers AWS (ECS/Fargate) **ou** si un client B2B institutionnel impose AWS GovCloud / contracts AWS spécifiques.

---

## 5. Vercel Edge Network — uniquement si on bascule sur Vercel

D'après [Vercel pricing 2026](https://vercel.com/pricing) + [Deploy Handbook 2026](https://deployhandbook.com/pricing/vercel) + [DeployWise Vercel reality](https://deploywise.dev/blog/vercel-pricing-explained) :

| Métrique | Hobby (Free) | Pro ($20/seat/mo) |
|---|---|---|
| **Fast Data Transfer** | 100 GB/mois | 1 TB included, $0.15/GB overage |
| **Function invocations** | 100 k/mois | 1 M/mois, $X/M overage |
| **Image Optimization** | Limited free | Per-1k images charged |
| **Edge Middleware exec** | Free up to limit | Per-M overage |
| **Commercial use** | ❌ interdit | ✅ |

**Verdict pour Musaium** : 
- **Hobby interdit en commercial** ⇒ obligation Pro $20/seat × N devs.
- **Hidden costs** documentés : "Vercel $20 → $286 reality at 100k visitors/mois" ([DeployWise](https://deploywise.dev/blog/vercel-pricing-explained)) — function invocations + image opt + edge middleware exec s'empilent.
- Lock-in Vercel = pas la philosophie Musaium (déploiement Docker self-host OVH, cf. `docs/OPS_DEPLOYMENT.md`).
- **Décision** : pas pertinent tant que `museum-web` reste sur OVH Node. Si on bascule vers OpenNext Cloudflare Workers (R18 §4 "long terme"), on garde Cloudflare ecosystem cohérent **sans** Vercel.

---

## 6. Image CDN options — comparatif 2026

### 6.1 Cloudinary

D'après [Cloudinary pricing](https://cloudinary.com/pricing) + [Capterra 2026](https://www.capterra.com/p/135074/Cloudinary/pricing/) :

- **Free tier** : **25 credits/mois** (1 credit = 1k transforms OU 1 GB storage OU 1 GB bandwidth).
- **Plus tier** : ~$99/mo entry.
- Modèle "credits" opaque, scale économiquement explosif.
- Video transforms et IA features = paywalled.
- **Verdict** : non.

### 6.2 ImageKit

D'après [ImageKit plans](https://imagekit.io/plans/) + [theimagecdn 2026 free plan](https://theimagecdn.com/docs/free-image-cdns/imagekit-free-plan-limits) :

- **Free tier** : 20 GB bandwidth/mois + 3 GB storage + **unlimited transforms** (!). 
- ⚠️ **Hard wall** : si > 20 GB bandwidth, **service stoppe entièrement** mid-mois jusqu'au reset (pas degradation).
- **Paid** : $9/mois entrée (50 GB bandwidth + 10 GB storage).
- **700+ edge nodes** (excellent), **AVIF supporté**.
- **GDPR** : 7 data centers locations, mais pas d'EU-only toggle natif. EU-US DPF certifié.
- **Verdict** : très bon rapport qualité/prix pour image-only CDN, surtout si AVIF est important. **À considérer en alternative B à Cloudflare Images si transforms > 5k/mois et < 50 GB bandwidth** (alors $9/mo flat ImageKit < $0.50/1k Cloudflare Images au-delà ~$0).

### 6.3 imgix

D'après [imgix pricing](https://www.imgix.com/pricing) + [pricingnow TCO](https://pricingnow.com/question/imgix-pricing/) :

- Modèle nouveau 2025 : **2 credits / GB cached** + 1 credit / GB bandwidth, **par image source**.
- Légacy : $3 / 1 000 source images + $0.08/GB CDN.
- "Most companies spend $500-$5 000/mois" ([G2 imgix](https://www.g2.com/products/imgix/pricing)).
- **Verdict** : entreprise/agency cible, pas startup B2C 100k MAU.

### 6.4 Cloudflare Images (déjà couvert §1.3)

### 6.5 BunnyCDN Optimizer (déjà couvert §2)

### 6.6 Tableau récap image CDN

| Provider | Free tier | Pay model | AVIF | GDPR EU-only | TTM Musaium |
|---|---|---|---|---|---|
| **Cloudflare Images** | 5 000 transforms/mois | $0.50/1k after, $0 storage si external origin | ✅ | EU DPF (CLOUD Act applicable) | **MEILLEUR au launch** |
| **BunnyCDN Optimizer** | aucun | $9.50/mo flat unlimited | ❌ WebP only | ✅ 1-click toggle | Bon si AVIF pas requis |
| **ImageKit** | 20 GB BW + unlimited transforms | $9/mo entrée 50 GB | ✅ | DPF + 7 regions | Solide alternative B |
| **Cloudinary** | 25 credits/mois | $99/mo entrée | ✅ | DPF | Trop cher scale |
| **imgix** | aucun | crédits/GB cached | ✅ | DPF | Enterprise only |
| **Self-host (Sharp backend)** | — | OVH CPU + bandwidth | ✅ (déjà fait R9) | ✅ origine UE | **OK au launch** |

**Décision Musaium** : self-host Sharp pour les uploads V1, **basculer Cloudflare Images external origin** si transforms runtime deviennent fréquents (V1.1+). Bunny Optimizer = plan B si Cloudflare incident GDPR.

---

## 7. EU data residency — GDPR + CRA

### 7.1 Cadre réglementaire

- **GDPR** (in force depuis 2018) : transferts hors UE OK si SCCs ou Adequacy Decision (e.g. EU-US DPF). Cloudflare ✅, BunnyCDN ✅ (intra-UE), ImageKit ✅ DPF.
- **EU Cyber Resilience Act (CRA)** : entré en vigueur 10 décembre 2024. **Obligations principales applicables 11 décembre 2027**. **Reporting obligations dès 11 septembre 2026** ([digital-strategy.ec.europa.eu](https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act)).
  - ⚠️ **CRA exclut SaaS pur** ([Cyber Defense Magazine 2026](https://www.cyberdefensemagazine.com/cyber-resilience-act-key-steps-compliance-challenges-and-practical-guidance/)). Musaium = "service mobile + landing" → potentiellement SaaS pur ⇒ CRA pas directement applicable.
  - **Mais** : si Musaium distribue une app mobile avec "remote data processing solutions" intégrées, le CRA peut s'appliquer au "produit" (l'app + le backend qu'elle utilise). À clarifier avec un conseil juridique avant 2027.
- **CLOUD Act US** : risque pour tout fournisseur US (Cloudflare, AWS, Vercel) → autorités US peuvent réquisitionner les données même hébergées en UE. Mitigation = chiffrement at-rest customer-managed keys (Cloudflare ✅ partiellement) et/ou choisir fournisseur EU-only (BunnyCDN).

### 7.2 Comparatif EU data residency

| Provider | EU data residency | Certifications | CLOUD Act risk |
|---|---|---|---|
| **Cloudflare** | EU POPs disponibles, pas d'EU-only toggle natif global, EU DPF + SCCs | ISO 27701, EU Cloud Code of Conduct, SOC 2 Type II, PCI DSS | **Oui** (entreprise US) |
| **BunnyCDN** | **EU-native (Slovenie)**, 1-click EU-only routing | ISO 27001 en cours, GDPR-by-design | Non (entreprise EU) |
| **ImageKit** | 7 regions globales (dont EU), DPF | DPF certifié | Risque selon hosting AWS |
| **AWS CloudFront** | eu-west-1/2/3, possible | ISO 27001, SOC, FedRAMP | **Oui** (US) |
| **Fastly** | EU POPs, pas de mode EU-only | ISO 27001, SOC 2 | **Oui** (US) |

**Verdict Musaium B2C** : Cloudflare suffit (DPA + SCCs en place). **Pour B2B musées institutionnels** (e.g. musée national français), un client peut **exiger** EU-only ⇒ BunnyCDN devient l'argument commercial.

### 7.3 Action item Musaium

1. Signer DPA Cloudflare (template auto via dashboard) avant DNS swap.
2. Vérifier que la **Privacy Policy Musaium** (déjà déployée — cf. `deploy-privacy-policy.yml`) mentionne Cloudflare comme sub-processor.
3. Tracking CRA reporting deadline 2026-09-11 — désigner un responsable produit/sécurité (probablement R7-driven).
4. Pour V1.1, évaluer Cloudflare DLP / Cloudflare Data Localization Suite si un musée B2B le demande.

---

## 8. Cache strategy détaillée

D'après [MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) + [web.dev SWR](https://web.dev/articles/stale-while-revalidate) + [Cloudflare Cache Rules docs](https://developers.cloudflare.com/cache/how-to/cache-rules/) :

### 8.1 Tableau de décision Musaium

| Resource type | Origin Cache-Control | Cloudflare Cache Rule | Browser TTL | Edge TTL | SWR |
|---|---|---|---|---|---|
| **Static Next.js assets** (`/_next/static/*`, content-hashed) | `public, max-age=31536000, immutable` | Eligible for cache, override edge TTL = 1 yr | 1 yr | 1 yr | — |
| **Public artwork images** (catalog statique) | `public, max-age=2592000, stale-while-revalidate=86400` | Edge TTL 30 j | 30 j | 30 j | 24 h |
| **User-uploaded chat images** (signed URL S3/R2) | `private, max-age=3600` | Bypass cache (signed URLs hash variable) | 1 h | n/a | — |
| **Landing pages SSR** (`/`, `/fr`, `/en`, `/support`) | `public, max-age=60, s-maxage=3600` | Edge TTL 1 h, browser 1 min | 1 min | 1 h | — |
| **Admin pages** (`/admin/*`) | `private, no-store` | Bypass cache | — | — | — |
| **API JSON `/api/health`** | `public, max-age=5` | Edge TTL 5 s | 5 s | 5 s | — |
| **API JSON `/api/auth/*`** | `no-store` | Bypass cache + rate limit rule | — | — | — |
| **API JSON `/api/chat/*`** | `private, no-cache` + `ETag` | Bypass cache (private = no edge) | 0 | — | — |
| **API JSON `/api/museums/*`** (read-mostly) | `public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` | Edge TTL 1 h, SWR 24 h | 5 min | 1 h | 24 h |
| **API JSON `/api/daily-art/*`** (1 image/jour) | `public, max-age=3600, s-maxage=21600` | Edge TTL 6 h | 1 h | 6 h | — |
| **Fonts (Inter via next/font)** | `public, max-age=31536000, immutable` | Edge TTL 1 yr | 1 yr | 1 yr | — |

### 8.2 Précisions techniques

- **`immutable` directive** : "no effect on public caches like Cloudflare but does change browser behavior" ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)). Browsers ne revalideront pas même sur F5. **Couplé avec content-hashed URLs Next.js** = safe.
- **`stale-while-revalidate`** ([web.dev SWR](https://web.dev/articles/stale-while-revalidate)) : sert le stale immédiatement et déclenche async revalidation. Cloudflare a fixé le bug "2 layers SWR" en Feb 2026 ([changelog 2026-02-26](https://developers.cloudflare.com/changelog/post/2026-02-26-async-stale-while-revalidate/)). **OK à utiliser maintenant**.
- **Cloudflare comportement par défaut** ([cache docs](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)) : ne cache pas si `Cache-Control: private | no-store | no-cache | max-age=0`, `Set-Cookie` présent, ou méthode HTTP ≠ GET. Donc API protégées **automatiquement bypass** sans config explicite.
- **ETag** ([Cloudflare cache concepts](https://developers.cloudflare.com/cache/concepts/cache-control/)) : Cloudflare convertit ETag en weak ETag par défaut. Strong ETag = enable explicitement (option zone). Notre Express expose déjà weak ETag par défaut (`express.static` + `compression`).
- **Cache Rules > Page Rules** ([Cloudflare cache rules docs](https://developers.cloudflare.com/cache/how-to/cache-rules/) + [migration guide](https://developers.cloudflare.com/rules/reference/page-rules-migration/)) : Page Rules sont **deprecated**, on use Cache Rules pour tout nouveau setup.

### 8.3 Cache Rules concrètes à appliquer (Cloudflare dashboard)

```
Rule 1 — Static Next.js
  Hostname: musaium.com OR musaium.fr
  AND URI Path starts with: /_next/static/
  Cache eligibility: Eligible
  Edge TTL: 1 year (31536000)
  Browser TTL: 1 year

Rule 2 — Public images CDN
  Hostname: musaium.com
  AND URI Path matches regex: ^/images/.*\.(png|jpg|jpeg|webp|avif|svg)$
  Cache eligibility: Eligible
  Edge TTL: 30 days
  Browser TTL: 30 days
  Cache key: ignore query strings (signed URLs hash en query => exclure ces paths)

Rule 3 — API bypass
  Hostname: api.musaium.com OR musaium.com/api/*
  AND URI Path starts with: /api/
  Cache eligibility: Bypass
  Origin Cache-Control respected

Rule 4 — Landing locale routes
  Hostname: musaium.com
  AND URI Path matches: ^/(fr|en)(/.*)?$
  Cache eligibility: Eligible
  Edge TTL: respect origin (Cache-Control s-maxage)
  Browser TTL: respect origin
```

---

## 9. DDoS protection — Cloudflare WAF + fail2ban + edge rate limit

### 9.1 Cloudflare DDoS L3/L4/L7 (Free)

D'après [Cloudflare DDoS docs](https://developers.cloudflare.com/ddos-protection/) :

- **Always on, unmetered, all plans** ([blog 2017 unmetered](https://blog.cloudflare.com/unmetered-ratelimiting/)).
- **HTTP DDoS Attack Protection managed ruleset** = layer 7, "available for zones on any plan" ([docs](https://developers.cloudflare.com/ddos-protection/managed-rulesets/http/)).
- Rate limiting rules **désormais inclus Free/Pro/Business sans add-on** ([blog](https://blog.cloudflare.com/unmetered-ratelimiting/)).

### 9.2 fail2ban + Cloudflare integration

D'après [DoHost cloud-native fail2ban 2026](https://dohost.us/index.php/2026/03/05/cloud-native-fail2ban-integrating-with-aws-security-groups-and-cloudflare-apis/) + [GridPane KB](https://gridpane.com/kb/using-fail2ban-with-cloudflare/) + [Cloudflare WAF IP rules](https://developers.cloudflare.com/waf/tools/ip-access-rules/) :

**Problème** : si Musaium reste sur fail2ban iptables local **sans modification**, les IPs Cloudflare se font ban (puisque toutes les requêtes proxied viennent de Cloudflare). Tous les vrais visiteurs erreur 502.

**Solution** :

1. **Configurer nginx real IP** :
   ```nginx
   # /etc/nginx/conf.d/cloudflare-real-ip.conf
   set_real_ip_from 173.245.48.0/20;   # liste Cloudflare /ips-v4
   set_real_ip_from 103.21.244.0/22;
   # ... (full list https://www.cloudflare.com/ips/)
   real_ip_header CF-Connecting-IP;
   real_ip_recursive on;
   ```
   ⚠️ Le `chat-message.route.ts` (rate limit local) et tous les log analyzers (Sentry, Promtail) verront alors la **vraie IP** visiteur, pas Cloudflare.

2. **fail2ban action Cloudflare API** : remplacer iptables-multiport par une action custom qui POST à `https://api.cloudflare.com/client/v4/user/firewall/access_rules/rules` avec `mode=block`. L'IP est bloquée **à l'edge** (jamais reach origin). CPU origin offload.

3. **fail2ban local conservé** pour SSH (port 22, hors Cloudflare proxy) + nginx error logs si non-Cloudflare bypass.

### 9.3 Rate limit edge — règles Musaium proposées

| Endpoint | Trigger | Action | Rationale |
|---|---|---|---|
| `/api/auth/login` | > 5 req / IP / 60 s | Challenge JS | Brute-force protection |
| `/api/auth/register` | > 3 req / IP / 600 s | Block 1 h | Anti-spam account creation |
| `/api/chat/messages` | > 30 req / IP / 60 s | Block 5 min | LLM cost protection (déjà fait backend mais redondance edge) |
| `/api/health` | > 100 req / IP / 60 s | Block 1 min | Anti-scraping health endpoint |
| `/api/*` | > 500 req / IP / 60 s | Challenge | Catch-all anti-abuse |

5 custom rules WAF Free tier ⇒ suffisant.

### 9.4 Bot Fight Mode

Free tier — laisse Cloudflare bloquer les bots known-bad au niveau edge (anti-scraping). Vérifier que les bots légitimes (Stripe webhook, Sentry crons, Better Stack heartbeats) sont **whitelistés** par Cloudflare (les vendor IPs sont auto-allow par CF Bot Fight Mode usually) ou via WAF allow rule.

---

## 10. Setup runbook — Cloudflare Free devant OVH

**Objectif** : DNS swap zero-downtime, rollback instantané, sans casser TLS ni les déploiements GHA actuels.

### Pré-requis

- Domaine `musaium.com` + `musaium.fr` actuellement géré DNS par OVH ou autre registrar.
- Accès SSH `deploy@VPS_HOST` (cf. `docs/OPS_DEPLOYMENT.md`).
- Compte Cloudflare créé (Free).
- Backup nginx config courant : `infra/nginx/conf.d/*.conf` versionné dans le repo.

### Étape 1 — Onboard zones Cloudflare (15 min)

1. Cloudflare dashboard → Add a Site → `musaium.com` → Free plan.
2. Cloudflare scrape automatiquement les DNS records existants. Vérifier que **tous les A/AAAA/MX/TXT/CNAME** sont importés. Manquants = ajouter manuellement.
3. **Important** : pour le moment **toggle proxy = DNS only (grey-cloud)** sur tous les records → on n'active rien encore.
4. Cloudflare donne 2 nameservers (e.g. `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`).
5. Répéter pour `musaium.fr`.

### Étape 2 — Préparer nginx pour Full(Strict) + real IP (30 min)

1. SSH `deploy@VPS_HOST`.
2. Sur le container nginx, créer `/etc/nginx/conf.d/01-cloudflare-real-ip.conf` (bind-mount via `docker-compose.yml`) avec la liste complète des CIDRs Cloudflare ([https://www.cloudflare.com/ips/](https://www.cloudflare.com/ips/)).
3. `docker exec <nginx> nginx -t && docker exec <nginx> nginx -s reload`.
4. Si TLS Origin Certificate Cloudflare souhaité (15 ans, alternative Let's Encrypt) :
   - Cloudflare → SSL/TLS → Origin Server → Create Certificate (default RSA 2048, 15 yrs, common name `*.musaium.com, musaium.com`).
   - Copier `.pem` et `.key` sur le VPS.
   - Pointer nginx `ssl_certificate /etc/nginx/origin/musaium.pem; ssl_certificate_key /etc/nginx/origin/musaium.key;`.
   - Sinon : garder Let's Encrypt actuel. **Recommandé d'abord** : ne rien changer côté nginx TLS, valider Cloudflare avec le cert LE existant.

### Étape 3 — Configurer Cache Rules + WAF AVANT proxy (15 min)

1. Cloudflare → Caching → Cache Rules → créer les 4 règles du §8.3.
2. Cloudflare → Security → WAF → Custom rules → créer les 5 rate limits du §9.3.
3. Cloudflare → SSL/TLS → Overview → choisir mode **Full (Strict)** (origin a un cert LE valide → strict OK).
4. Cloudflare → SSL/TLS → Edge Certificates → enable **Always Use HTTPS**, **Automatic HTTPS Rewrites**, **HSTS** (max-age 6 mois, includeSubDomains, preload pour V1.1 après bake).
5. Cloudflare → Security → Bots → enable **Bot Fight Mode**.
6. Cloudflare → DNS → IP Geolocation = ON (passe header `CF-IPCountry` au origin, utile pour analytics).

### Étape 4 — Switch nameservers (5 min + propagation TTL)

1. Chez le registrar `musaium.com` → Domain → Nameservers → set custom → coller les 2 NS Cloudflare.
2. Idem `musaium.fr`.
3. Attendre 5 min - 2 h (TTL old NS). Cloudflare → Overview affiche "Active" quand propagated.
4. **À ce stade, le trafic passe par Cloudflare DNS-only (grey cloud). Pas encore de cache/WAF.** Le service reste 100% identique à avant — c'est juste un changement de résolveur DNS.

### Étape 5 — Activer le proxy (orange-cloud) progressivement (30 min)

1. **D'abord les sous-domaines low-risk** :
   - `www.musaium.com` → A record → toggle proxy ON (orange).
   - `musaium.com` apex → A record → toggle proxy ON.
2. Smoke test : `curl -v https://musaium.com/api/health` → vérifier `CF-Cache-Status` header présent ; pas d'erreur cert ; latence raisonnable.
3. `curl https://musaium.com/admin/login` → vérifier que la CSP nonce fonctionne (page Next.js rendue correctement, sans erreur console).
4. **Tester les uploads chat** depuis mobile (S3 signed URLs).
5. Si OK, activer le proxy sur `api.musaium.com` (si sous-domaine séparé). Sinon `api/*` est déjà couvert par le proxy `musaium.com`.

### Étape 6 — Vérifier l'observabilité (15 min)

1. **Sentry** : vérifier que les requêtes traceability fonctionne. Cloudflare ajoute `cf-ray` header → enrichir Sentry tags si souhaité.
2. **Grafana** (cf. `infra/grafana/`) : vérifier que les métriques nginx (req/s, upstream latency) montrent une **baisse de volume** (Cloudflare absorbe le statique) + un **CF-Cache-Status: HIT** apparaît sur Prometheus si on parse les logs nginx.
3. **Better Stack** uptime heartbeats : vérifier que les TLS monitor cron + cert renewal heartbeats passent toujours (les bots Cloudflare-friendly devraient être whitelistés par Bot Fight).
4. **Real IP dans les logs** : `tail -f /var/log/nginx/access.log` → confirmer que la colonne `$remote_addr` montre des vraies IPs visiteurs (pas des `162.158.*` qui sont Cloudflare). Si non, `01-cloudflare-real-ip.conf` mal appliqué.

### Étape 7 — Bake monitoring 7 jours

- Daily check : Cloudflare Analytics dashboard → vérifier hit rate cache (> 50% target sur `/_next/static`, > 30% global), erreur 5xx < 0.1%, requests/min stable.
- Surveiller `nginx error.log` pour 502/504 (origin pull failures).
- Si tout OK après 7 jours : enable **HSTS preload** + **Authenticated Origin Pulls** (V1.1 hardening).

### Rollback procedure (instantané)

- **Cause** : Cloudflare incident / mauvaise règle / cert issue.
- **Action** : Cloudflare → DNS → toggle proxy OFF (grey) sur les records concernés. Trafic repart directement vers OVH IP en < 30 s (TTL Cloudflare DNS = 5 min par défaut, mais le orange-grey toggle prend effet instantanément côté Cloudflare edge).
- **Worst case** : changer les nameservers chez le registrar pour pointer vers DNS OVH + cache négatif TTL = quelques heures pour propagation. Avoir un backup zone file exporté (Cloudflare → DNS → Records → Export) **avant** l'onboard.

### Coûts setup

- Cloudflare Free plan : **0 €/mois**.
- Cloudflare Origin Certificate : **0 €**.
- Bandwidth Cloudflare : **0 €** (unlimited proxied).
- Origin OVH inchangé.
- Travail : **2-3 h** dev + 7j bake monitoring.

---

## 11. Cost model à 100k MAU (synthèse)

Hypothèses Musaium year 1 launch → year 2 steady-state :

- Backend egress : **300 GB/mois** (chat media + API JSON).
- Web egress : **200 GB/mois** (landing FR/EN + admin).
- Image storage : **50 GB** year 1, **500 GB** year 2.
- Image transforms : **3 000/mois** year 1 (Sharp backend), peut monter à **15 000/mois** year 2 si runtime transforms.

| Stack | Year 1 ($) | Year 2 ($) | Verdict |
|---|---|---|---|
| **OVH only (status quo)** | $20-30/mo egress + CPU image | $50-80/mo egress + CPU strained | Origin saturé, latency Asie/Am non-EU |
| **Cloudflare Free + OVH origin** | **$0/mo** + OVH inchangé | **$0/mo** + OVH offloaded (CPU dispo) | **Best ROI launch** |
| **Cloudflare Free + R2 + Images** | **$0** (free tier 10 GB) | **$25-35/mo** R2 + Images si > 5k transforms | Critical à 500 GB+ |
| **BunnyCDN Standard + Storage + Optimizer** | **~$15/mo** | **~$30/mo** | Bon, mais pas gratuit |
| **AWS CloudFront + S3 standard** | **$0/mo** (1 TB free tier) | **~$85-150/mo** | Cher au-delà free tier |
| **Fastly** | **$50/mo min** | **$50/mo min** | Pas de free tier |
| **Vercel Pro** | **$20/seat + overages** | **$200-300/mo** ([DeployWise](https://deploywise.dev/blog/vercel-pricing-explained)) | Lock-in + hidden costs |

**Recommandation chiffrée** :

- Phase 1 (launch → 6 mois) : **Cloudflare Free + OVH S3-compat existant** = **$0/mo** + 2-3h setup.
- Phase 2 (6 mois → 18 mois, ~50 k MAU) : ajout **R2 migration** quand egress OVH > 30 €/mois ou stockage > 50 GB.
- Phase 3 (≥ 100 k MAU year 2) : ajout **Cloudflare Images external origin** ou **Bunny Optimizer** si transforms > 5 k/mois.

---

## 12. Verdict final + roadmap

### Décision

1. **Avant launch 2026-06-01 — OBLIGATOIRE** : Cloudflare Free devant OVH, Cache Rules + WAF + DDoS + real-IP nginx. Coût = 0 €. ROI = LCP global ↓ 30-50% hors EU + DDoS protection + bandwidth offload + rate limit edge. **2-3 h setup**.

2. **V1.0 launch (juin 2026)** : status quo image pipeline (Sharp backend + S3 OVH). Cache Rules absorbent le statique. Pas besoin de R2 ni Images encore.

3. **V1.1 (sept 2026, post-launch bake)** : 
   - Enable HSTS preload + Authenticated Origin Pulls.
   - Monitor egress OVH ; si > 30 €/mois, planifier migration R2 (1-2 jours dev, swap S3 endpoint dans `chat-module.ts:356-372` + DNS bucket custom domain).
   - Si transforms runtime apparaissent (lazy thumbnails, responsive variants), évaluer Cloudflare Images external origin.

4. **V1.2+ (2027)** : si Musaium gagne un client B2B musée institutionnel exigeant "data stays EU only", évaluer migration **Cloudflare Data Localization Suite** (Enterprise, ~$5k+/mois) ou **bascule BunnyCDN** (EU-only routing toggle, ISO 27001 finalisé).

### Ne PAS faire

- **Pas de Fastly** (pas de free tier).
- **Pas de Vercel** (hidden costs, lock-in).
- **Pas de CloudFront** (1 TB free seulement, $0.085/GB après).
- **Pas de Cloudinary** (free tier 25 credits ridicule, scale explose).
- **Pas d'imgix** (entreprise/agency, pas startup B2C).
- **Pas d'EU-only mode forcé immédiat** (Cloudflare global est optimal perf ; activer EU-only seulement si exigence B2B contractuelle).

### Risques à monitorer

| Risque | Mitigation |
|---|---|
| Cloudflare CLOUD Act subpoena | DPA signé + chiffrement data at-rest + plan B Bunny si incident publique majeur |
| Real-IP nginx mal configuré → fail2ban bloque CF | Validation §10 étape 6, test sur staging environnement avant prod |
| Cache Rules trop agressifs sur API → données stale | Bypass `/api/*` strict par défaut, élargir cache opt-in seulement |
| Cloudflare incident global (rare mais arrivé 2020, 2023, 2024) | Rollback DNS instantané (toggle proxy off ou nameserver switch) |
| EU CRA 2027 obligations | Tracking 2026-09 reporting deadline, désigner responsable RGPD + sécurité produit |
| Class A operations R2 plus chères que prévu | Surveiller métrique post-migration, optimiser via Worker batching |

---

## Sources

### Cloudflare officiel

- [Cloudflare Plans](https://www.cloudflare.com/plans/)
- [Cloudflare Free Plan Overview](https://www.cloudflare.com/plans/free/)
- [Cloudflare Pro Plan Overview](https://www.cloudflare.com/plans/pro/)
- [Cloudflare R2 pricing docs](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare R2 calculator](https://r2-calculator.cloudflare.com/)
- [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/)
- [Cloudflare DDoS Protection](https://developers.cloudflare.com/ddos-protection/)
- [Cloudflare DDoS HTTP managed ruleset](https://developers.cloudflare.com/ddos-protection/managed-rulesets/http/)
- [Cloudflare WAF Rate limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Cloudflare WAF IP Access rules](https://developers.cloudflare.com/waf/tools/ip-access-rules/)
- [Cloudflare Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/)
- [Cloudflare Cache Rules settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)
- [Cloudflare Cache concepts — Cache-Control](https://developers.cloudflare.com/cache/concepts/cache-control/)
- [Cloudflare Cache default behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)
- [Cloudflare Cache Response Rules changelog 2026-03-24](https://developers.cloudflare.com/changelog/post/2026-03-24-cache-response-rules/)
- [Cloudflare async SWR fix 2026-02-26](https://developers.cloudflare.com/changelog/post/2026-02-26-async-stale-while-revalidate/)
- [Cloudflare Page Rules migration guide](https://developers.cloudflare.com/rules/reference/page-rules-migration/)
- [Cloudflare future of Page Rules](https://blog.cloudflare.com/future-of-page-rules/)
- [Cloudflare GDPR Trust Hub](https://www.cloudflare.com/trust-hub/gdpr/)
- [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/)
- [Cloudflare R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- [Cloudflare R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [Cloudflare R2 Public Buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Cloudflare R2 rclone integration](https://developers.cloudflare.com/r2/examples/rclone/)
- [Cloudflare unmetered rate-limiting blog](https://blog.cloudflare.com/unmetered-ratelimiting/)
- [Cloudflare R2 vs AWS S3 comparison](https://www.cloudflare.com/pg-cloudflare-r2-vs-aws-s3/)
- [Cloudflare Argo Smart Routing](https://www.cloudflare.com/application-services/products/argo-smart-routing/)

### BunnyCDN

- [bunny.net pricing](https://bunny.net/pricing/)
- [bunny.net storage pricing](https://bunny.net/pricing/storage/)
- [bunny.net CDN pricing](https://bunny.net/pricing/cdn/)
- [bunny.net Optimizer](https://support.bunny.net/hc/en-us/articles/360020557500-Understanding-the-Bunny-Optimizer)
- [bunny.net GDPR](https://bunny.net/gdpr/)
- [bunny.net routing filters EU-only](https://bunny.net/blog/introducing-routing-filters-gdpr-friendly-eu-only-cdn-routing/)
- [bunny.net AVIF position](https://bunny.net/blog/lets-talk-avif-and-why-we-are-not-adding-support-just-yet/)

### Fastly

- [Fastly pricing](https://www.fastly.com/pricing)
- [Fastly account types](https://www.fastly.com/documentation/guides/account-info/billing/account-types/)
- [Fastly Compute review 2026 — srvrlss](https://www.srvrlss.io/provider/fastly/)

### AWS CloudFront / S3

- [AWS CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)
- [AWS CloudFront flat-rate plans](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html)
- [LeanOps AWS data transfer 2026](https://leanopstech.com/blog/aws-data-transfer-pricing-2026/)
- [EgressCost.com AWS 2026](https://egresscost.com/aws/)

### Vercel

- [Vercel pricing](https://vercel.com/pricing)
- [DeployHandbook Vercel 2026](https://deployhandbook.com/pricing/vercel)
- [DeployWise Vercel reality $20 → $286](https://deploywise.dev/blog/vercel-pricing-explained)

### Cloudinary / ImageKit / imgix

- [Cloudinary pricing](https://cloudinary.com/pricing)
- [Cloudinary credits doc](https://cloudinary.com/documentation/developer_onboarding_faq_credits)
- [ImageKit pricing plans](https://imagekit.io/plans/)
- [ImageKit GDPR](https://imagekit.io/gdpr/)
- [ImageKit security](https://imagekit.io/security-and-trust/)
- [theimagecdn ImageKit free plan limits 2026](https://theimagecdn.com/docs/free-image-cdns/imagekit-free-plan-limits)
- [imgix pricing](https://www.imgix.com/pricing)
- [pricingnow imgix TCO 2026](https://pricingnow.com/question/imgix-pricing/)

### Benchmarks et comparatifs

- [theimagecdn Cloudflare Images pricing 2026](https://theimagecdn.com/docs/cloudflare-images-pricing)
- [theimagecdn Best image CDNs 2026](https://theimagecdn.com/docs/best-image-cdns)
- [theimagecdn Image CDNs for startups](https://theimagecdn.com/docs/image-cdns-for-startups)
- [theimagecdn WebP vs AVIF vs JPEG](https://theimagecdn.com/docs/webp-vs-avif-vs-jpeg)
- [theimagecdn Free image CDNs 2026](https://theimagecdn.com/docs/free-image-cdns)
- [Kunal Ganglani Bunny vs Cloudflare 2026](https://www.kunalganglani.com/blog/bunnynet-vs-cloudflare-2026)
- [LeanOps Cloudflare R2 pricing 2026](https://leanopstech.com/blog/cloudflare-r2-pricing-2026/)
- [LeanOps Cloudflare Images vs Cloudinary 2026](https://leanopstech.com/blog/cloudflare-images-pricing-2026/)
- [Vantage R2 vs S3](https://www.vantage.sh/blog/cloudflare-r2-aws-s3-comparison)
- [Vantage CloudFront vs Fastly](https://www.vantage.sh/blog/cloudfront-fastly-cdn-comparison)
- [Cloudflare benchmark edge network performance](https://blog.cloudflare.com/benchmarking-edge-network-performance/)
- [blazingcdn CDN pricing war 2026](https://blog.blazingcdn.com/en-us/what-are-the-current-prices-for-major-cdn-providers)
- [costbench Cloudflare pricing 2026](https://costbench.com/software/cdn-edge/cloudflare/)
- [costbench Bunny pricing 2026](https://costbench.com/software/cdn-edge/bunny-cdn/)
- [InMotion 5 top CDN 2026](https://www.inmotionhosting.com/blog/top-cdn-providers/)

### Cache & web perf

- [MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)
- [MDN HTTP Caching guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)
- [web.dev stale-while-revalidate](https://web.dev/articles/stale-while-revalidate)
- [Simon Hearne caching best practices](https://simonhearne.com/2022/caching-header-best-practices/)
- [Request Metrics HTTP caching guide](https://requestmetrics.com/web-performance/http-caching/)

### Setup / runbook

- [Cloudflare nginx reverse proxy SSL community](https://community.cloudflare.com/t/reverse-proxy-via-nginx-cloudflare-ssl/352985)
- [Cloudflare Origin Certificates Virtubox KB](https://kb.virtubox.net/knowledgebase/cloudflare-ssl-origin-certificates-nginx/)
- [DigitalOcean Cloudflare + nginx tutorial](https://www.digitalocean.com/community/tutorials/how-to-host-a-website-using-cloudflare-and-nginx-on-ubuntu-20-04)
- [CubePath Cloudflare VPS config](https://cubepath.com/docs/cloud-integration/cloudflare-cdn-configuration-for-vps)
- [Ruan Martinelli — R2 presigned uploads](https://ruanmartinelli.com/blog/cloudflare-r2-pre-signed-urls/)

### fail2ban / WAF

- [DoHost cloud-native fail2ban Cloudflare AWS 2026](https://dohost.us/index.php/2026/03/05/cloud-native-fail2ban-integrating-with-aws-security-groups-and-cloudflare-apis/)
- [GridPane fail2ban + Cloudflare](https://gridpane.com/kb/using-fail2ban-with-cloudflare/)
- [NikSec fail2ban + Cloudflare](https://niksec.com/using-fail2ban-with-cloudflare/)

### EU CRA / GDPR

- [EU Commission Cyber Resilience Act](https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act)
- [EU CRA summary](https://digital-strategy.ec.europa.eu/en/policies/cra-summary)
- [Hogan Lovells EU CRA 2026 milestones](https://www.hoganlovells.com/en/publications/eu-cyber-resilience-act-getting-ready-for-cra-compliance-in-2026)
- [Cyber Defense Magazine CRA practical guidance 2026](https://www.cyberdefensemagazine.com/cyber-resilience-act-key-steps-compliance-challenges-and-practical-guidance/)
- [Pillsbury Law EU CRA requirements](https://www.pillsburylaw.com/en/news-and-insights/eu-cyber-resilience-act-requirements-products-software.html)
