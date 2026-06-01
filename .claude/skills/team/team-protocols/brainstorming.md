# Brainstorming → Design — protocole /team (UFR-022)

> **Absorbé de `superpowers:brainstorming` (2026-05-31, Q4).** Vendored, adapté au pipeline AUTONOME
> /team (le skill natif est interactif un-question-à-la-fois ; /team tourne en autonomie). On garde le
> cœur transférable, on laisse le dialogue interactif + le visual companion (hors pipeline). S'applique
> à la **phase spec/plan (architect)**. Pas de nouveau hook : le HARD-GATE « pas de code avant design »
> est déjà imposé par l'ordre spec→plan→red. Crédit : Obra/superpowers.

## Le HARD-GATE (déjà structurel en /team)
Aucune implémentation (red/green) avant que `spec.md` + `design.md` existent et soient cohérents. /team
l'impose par l'ordre des phases — un editor red ne spawne jamais avant un architect spec+plan.

## Ce que l'architect spec (phase #1) DOIT faire avant de durcir la spec
1. **Explorer le contexte** : `gitnexus_query` pour mapper la demande aux modules existants, lire `roadmap-context.json`, suivre les patterns existants.
2. **Évaluer le scope AVANT de raffiner les détails** : si la demande couvre plusieurs sous-systèmes indépendants (« plateforme avec chat + storage + billing + analytics »), **FLAG décomposition** d'abord — ne pas spécifier finement un projet qui doit être découpé. Chaque sous-projet = son propre cycle spec→plan→impl.
3. **Surfacer les ambiguïtés** : tout requirement interprétable de 2 façons → soit le rendre explicite (choisir et l'écrire), soit, si la décision est produit/archi, l'inscrire en **`## Open questions`** dans `spec.md` et escalader le Tech Lead — ne PAS deviner en silence (anti-pattern : « j'ai supposé X »).
4. **YAGNI sans pitié** : retirer toute feature non demandée. Un finding/feature « professionnel » non appelé → ne pas l'ajouter (`grep` le codebase pour l'usage réel).

## Ce que l'architect plan (phase #2) DOIT faire
1. **Proposer 2-3 approches** avec trade-offs dans `design.md`, mener avec la recommandée + le pourquoi. (Beats one-attempt-iterated quand l'espace de solution est large.)
2. **Design for isolation** : découper en unités à une seule responsabilité, interfaces bien définies, testables indépendamment. Pour chaque unité : que fait-elle, comment l'utilise-t-on, de quoi dépend-elle ? Un fichier qui grossit = signal qu'il fait trop.
3. **Codebase existant** : explorer la structure avant de proposer ; suivre les patterns ; améliorer ciblé ce qu'on touche (fichier trop gros, frontières floues) ; PAS de refacto non lié.

## Spec self-review (avant handoff plan→red)
Relire `spec.md`/`design.md` à l'œil neuf : (1) placeholders TBD/TODO → fixer ; (2) cohérence interne (sections
qui se contredisent ? archi ↔ features ?) ; (3) scope (assez focalisé pour UN plan d'impl, ou à décomposer ?) ;
(4) ambiguïté (un requirement interprétable de 2 façons → choisir et expliciter). Fixer inline. Le hook
`pre-feature-spec-check.sh` ferme déjà la porte Spec Kit (3 fichiers, headers remplis).

## Principes clés (transférés)
Un seul sujet d'ambiguïté à la fois · YAGNI ruthlessly · 2-3 approches avant de trancher · validation incrémentale ·
flexible (revenir clarifier si ça ne tient pas). Le terminal du brainstorming natif = `writing-plans` ; en /team =
la phase plan (architect #2). On n'invoque aucun skill d'implémentation avant.

## Hors pipeline (laissé au natif)
Le dialogue interactif un-question-à-la-fois + le Visual Companion (mockups navigateur) restent des outils
natifs `superpowers:brainstorming`, à utiliser en session classique AVANT de lancer `/team` quand l'intention
est floue. /team présuppose une demande suffisamment cadrée (ou la flag en `## Open questions`).
```
