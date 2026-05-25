# 🎓 Les 5 missions expliquées — ce qui va être produit

> Lecture « prof » : pour chaque mission, l'état actuel, ce qu'on construit, pourquoi ça compte, et l'état « fini ». Détail technique + seeds dans `MISSIONS.md`.

---

## 🟦 MISSION 1 — Chat & AI pipeline : le cœur du produit, rendu correct, privé et accessible

C'est le geste central de Musaium : tu photographies une œuvre, tu parles à l'IA, elle te répond. Cette mission ne « rajoute » pas une feature — elle rend ce pipeline **irréprochable** sur trois axes : la vie privée de la conversation, l'accessibilité, et la complétude du flux.

**1. La confidentialité de la conversation (le plus important).** Aujourd'hui il y a trois fuites silencieuses :
- Quand l'utilisateur **refuse** de partager sa position avec l'IA, l'app envoie quand même ses **coordonnées GPS exactes** au LLM via un chemin de secours — c'est *pire* que s'il avait accepté (où l'on n'envoie que la ville). On produit un pipeline où *refuser = zéro localisation* n'atteint le modèle, avec des tests couvrant **chaque état de consentement** (accordé / refusé / révoqué / anonyme).
- Les **logs d'erreur** impriment les URLs complètes en clair (donc les tokens, codes OAuth, emails en query-string) dans la sortie standard. On ajoute une **couche de masquage** au logger : un log ne doit jamais contenir de PII.
- **Langfuse** (l'outil d'observabilité IA) capture le texte libre de l'utilisateur dès qu'une image est jointe, parce que le masque ne gère que les messages texte simples, pas le format tableau « texte + image ». On étend le masque à ce cas.

**2. La voix et le RGPD du contenu.** Refuser le consentement « voix IA » laisse quand même l'app envoyer le texte à la synthèse vocale d'OpenAI : on **verrouille** ce point. L'export RGPD « télécharge mes données » oublie les **œuvres que les photos de l'utilisateur ont reconnues** (`artwork_matches`) : on les ajoute. Et le cache audio TTS utilise encore `.mp3` alors que le backend produit de l'Opus : on corrige pour que la relecture vocale fonctionne.

**3. Le rendu et la finition de la conversation.** Le bug de la bulle vide (P0-FA1, déjà corrigé) est **re-vérifié sans régression**, et on couvre **toutes** les stratégies d'envoi (texte / image / audio / cache / hors-ligne) par des tests. Les utilisateurs **francophones** reçoivent aujourd'hui l'anglais à cause d'un bug de code-langue (`fr-FR` ≠ `fr`) : corrigé. Le lecteur d'écran lit « Votre message » au lieu du **vrai texte tapé** : corrigé. Le code SSE mort est enterré.

**4. L'image-compare rendue réelle.** Le hook `useCompareImage` existe mais n'est branché à rien : on le **connecte à l'écran** pour que « compare cette œuvre » se déclenche vraiment, et on active le seuil de score pour rejeter les correspondances de mauvaise qualité.

**État fini** : un pipeline de chat où *ce que l'utilisateur a refusé n'est jamais envoyé*, où les logs et l'observabilité sont propres, où chaque fonction (envoi, rendu, consentement, compare) a tous ses cas couverts par des tests rouge→vert.

---

## 🟩 MISSION 2 — Plateforme B2B : mesurer l'amour des visiteurs (NPS) et pouvoir pitcher un musée

C'est la capacité « peut-on démontrer la valeur à un musée ? » (objectif KR1) **et** « est-ce que les visiteurs adorent ? » (objectif KR2, le NPS).

**1. Mesurer le NPS (KR2) — aujourd'hui c'est littéralement impossible.** Le widget de note plafonne à **5 étoiles** alors qu'un NPS demande une échelle **0-10** ; la fonction d'agrégation existe mais **aucune route ne l'appelle** ; et l'attribution au musée est fausse (elle tague la note avec le musée *de l'utilisateur*, or un visiteur B2C n'en a pas — il faut taguer avec le **musée de la session notée**). On produit : une note **0-10** post-session, un **endpoint** qui calcule le NPS (global + par musée : %promoteurs − %détracteurs), l'attribution correcte depuis la session, et un **tableau de bord admin** qui l'affiche. **État fini** : tu peux enfin répondre à ton propre OKR — « le compagnon obtient-il un NPS ≥ 7 ? ».

**2. L'admin multi-tenant (rôle museum_manager) — aujourd'hui à moitié construit et qui fuit.** Le gestionnaire de musée voit les statistiques **globales de toute la plateforme** (fuite cross-tenant) et **7 liens de nav sur 8 renvoient 403**. On produit : un museum_manager qui ne voit **que son musée** (stats, avis, tickets), avec des **tests adversariaux** prouvant l'isolation (un manager du musée A ne peut pas lire le B), tous les liens fonctionnels, et le sélecteur d'analytics réparé. **État fini** : un véritable back-office B2B isolé, démontrable à un musée.

**3. Le co-branding.** Un admin peut définir la couleur/le logo d'un musée mais **l'app mobile l'ignore** (écriture dans le vide). On construit le **consumer mobile** pour que le branding d'un musée s'affiche réellement. **État fini** : la démo co-branding fonctionne.

**4. Le tunnel d'adoption (KR4).** Le funnel est **muet en prod** (variable d'env manquante). On le branche et on vérifie que les événements partent bien, *avec le consentement*.

---

## 🟨 MISSION 3 — Auth, compte & sécurité : des portes sûres qui ne piègent pas l'utilisateur

Inscription, connexion, suppression de compte : ça doit être sûr **et** ne jamais enfermer l'utilisateur.

**1. La MFA sans le piège du verrou.** Aujourd'hui un utilisateur peut *activer* la double authentification… puis **ne plus pouvoir se reconnecter** (l'écran de défi n'est monté nulle part) → compte verrouillé à vie. On **neutralise l'entrée d'enrôlement** en V1 pour que personne ne puisse se piéger, et on tranche la décision produit sur le flow complet. **État fini** : aucun utilisateur ne peut bloquer son compte via la MFA.

**2. Le rejeu TOTP.** Le marquage « code utilisé » n'est pas atomique : deux requêtes simultanées avec le même code passent toutes les deux. On le rend **compare-and-set** avec un test de concurrence.

**3. Aucun lead perdu.** Les inscriptions (beta / B2B) ne partent qu'à Brevo ; si Brevo tombe, le lead est **perdu définitivement** (erreur 500 avant la réponse). On **persiste le lead en local d'abord**, puis on synchronise vers Brevo avec reprise, et on documente les endpoints dans l'OpenAPI.

**4. L'hygiène du compte de smoke-test.** Le test de prod crée à **chaque déploiement** un compte connectable permanent, et une ligne « efface le token » qui ne fait silencieusement rien (piège TypeORM). On corrige le no-op et on **démantèle** le compte.

**5. La complétude de l'effacement (RGPD Art.17).** La suppression de compte est « best-effort » : on s'assure que les orphelins audio/Brevo/S3 sont nettoyés, que le journal d'audit de suppression est écrit **après** le nettoyage (pas avant — sinon il ment si le nettoyage échoue), et on couvre **tous** les chemins d'effacement.

---

## 🟧 MISSION 4 — Fiabilité prod & coût : la nuit du lancement, peut-on voir l'app et la financer ?

**1. L'observabilité (KR3).** Aujourd'hui, si le backend crashe, si la base de données tombe ou si Redis meurt, **personne n'est alerté** (seule une métrique bas-niveau existe). On produit de **vraies alertes** (backend down, pics de 5xx, DB/Redis down) avec un routage par sévérité. **État fini** : un crash réveille quelqu'un.

**2. Le confinement du coût.** Le plafond de coût LLM a des trous : les utilisateurs **anonymes le contournent**, le juge IA **échoue en mode ouvert** (plus de protection) quand le budget journalier est épuisé, et la voix (STT/TTS) n'est pas comptée. Pire, le disjoncteur **remet à zéro le compteur journalier** à sa reprise (donc une journée à pics peut dépasser le plafond de 500 $). On **fusionne le correctif** (#300) et on ferme tous les trous. **État fini** : la facture LLM ne peut pas s'emballer la nuit.

**3. La sûreté du déploiement et de la base.** Les migrations s'exécutent **deux fois** par déploiement ; la version de pgvector (≥0.7.0) n'est pas vérifiée (revert silencieux sur un vieux Postgres) ; plusieurs index manquent (scans de table complets à l'échelle) ; certains gates CI sont du **théâtre** (ne s'exécutent jamais). On rend les migrations **single-path**, on ajoute la garde pgvector, les index, et on rend les gates CI réels.

---

## 🟥 MISSION 5 — Contenu, conformité, a11y & honnêteté : l'app paraît finie, elle est légale, et elle ne ment pas

**1. L'intégrité du contenu.** **14 des 30 images** de l'œuvre du jour sont cassées (dont la Joconde), et l'image-compare (SigLIP) renvoie une erreur 503 au démarrage car le modèle n'est pas provisionné. On **re-source les images** + on ajoute un sentinel CI qui détecte les futurs liens morts, et on **provisionne le modèle** pour que la comparaison fonctionne.

**2. L'accessibilité (loi EAA).** Les badges de statut échouent au contraste (2,15:1), et l'email de contact accessibilité pointe vers un domaine que tu **ne possèdes pas** (`musaium.app`). On corrige le contraste et le domaine pour que les personnes handicapées puissent réellement te joindre (obligation légale).

**3. La conformité légale (RGPD/CRA).** La clé PGP est un placeholder, le bucket S3 n'a pas de garde d'accès public, et trois sous-traitants (Langfuse/CARTO/Expo) manquent aux registres légaux. On ajoute des **gates CI** (bloquer le déploiement si la PGP est un placeholder / si le bucket est public) et on **complète les registres** (Art.28 sous-traitants + Art.30 ROPA).

**4. L'honnêteté (UFR-013).** Un fichier committé prétend un travail jamais fusionné ; certaines lignes de roadmap décrivent comme « live » des bugs déjà corrigés ; deux ancres de doc pointent vers des fichiers supprimés ; un sentinel cité dans CLAUDE.md n'existe pas. On **nettoie tout** pour que la documentation dise la vérité.

**5. L'enterrement du code mort (UFR-016).** Un script de seed « musées de Paris » contredit le périmètre V1, une WelcomeCard montée nulle part, etc. On les **supprime** (git garde l'historique).

---

## Le fil rouge des 5 missions

Trois motifs reviennent partout, et les missions les traitent à la racine :
1. **« Le code existe ≠ la feature marche »** — beaucoup de plomberie backend sans branchement frontend (préférences, NPS, useCompareImage, branding). Règle : *câbler OU enterrer*, jamais laisser à moitié.
2. **« Les tests verts peuvent mentir »** — quand ils simulent l'interaction qui casse. D'où le TDD rouge-d'abord sur le *vrai* chemin de prod, et la couverture exhaustive de chaque fonction.
3. **« La promesse doit être vraie »** — consentement réellement appliqué, doc honnête, conformité réelle. C'est ce qui sépare un produit *entreprise-grade* d'un produit qui *a l'air* fini.

**Objectif final commun** : zéro défaut par domaine, zéro report, puis un smoke prod local ≥48h (auth + chat + photo + DSAR + geofence) avant le bake de lancement.
