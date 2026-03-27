# /recap — Daily Recap Musaium

Genere un recapitulatif quotidien base UNIQUEMENT sur des sources verifiables.

## SOURCES AUTORISEES (les SEULES)

1. `git log --since="midnight" --oneline` — commits du jour
2. `git log --since="midnight" --stat` — fichiers modifies
3. `pnpm test 2>&1 | tail -5` dans museum-backend — etat des tests backend
4. `npm test 2>&1 | tail -5` dans museum-frontend — etat des tests frontend
5. `npm run lint` dans museum-web — etat du typecheck web
6. `wc -l .claude/team-knowledge/*.json` — taille KB actuelle

## SOURCES INTERDITES

- Memoire ou impression de ce qui s'est passe
- KB JSON (team-knowledge/) — source derivee, potentiellement fausse
- Contenu des rapports precedents (team-reports/) — snapshots potentiellement incorrects
- Extrapolations ou narratifs "plausibles"

## EXECUTION

A l'invocation de `/recap` :

1. Executer `git log --since="midnight" --oneline` et compter les commits
2. Grouper par prefixe conventionnel (feat, fix, refactor, chore, test, docs)
3. Executer les tests et lints sur chaque projet
4. Comparer avec le commit le plus ancien du jour pour calculer les deltas
5. Formatter selon le template ci-dessous
6. Presenter a l'utilisateur

## FORMAT DE SORTIE

```
## Recap [date]

### Commits ([N] commits)
feat:     [N] — [resume 1 ligne]
fix:      [N] — [resume 1 ligne]
refactor: [N] — [resume 1 ligne]
chore:    [N] — [resume 1 ligne]
test:     [N] — [resume 1 ligne]
docs:     [N] — [resume 1 ligne]

### Etat du code
Backend:  lint [PASS/FAIL] | tests [N pass / N fail] | build [PASS/FAIL]
Frontend: lint [PASS/FAIL] | tests [N pass / N fail]
Web:      lint [PASS/FAIL] | build [PASS/FAIL]

### Delta depuis hier
Tests:    [N] -> [N] ([+/-N])
Files:    [N] fichiers modifies aujourd'hui

### Points d'attention
[Seulement si un test fail, un lint fail, ou une regression detectee]
[Si tout passe : "Aucun point d'attention."]

### KB Health
[N] lignes total | [taille] sur disque
```

## REGLES

- NE PAS inventer de metriques — si une commande echoue, reporter l'erreur
- NE PAS copier de donnees de la KB — git log est la seule source de verite
- NE PAS ajouter de "learnings" ou "patterns" — c'est le role de /team
- NE PAS modifier de fichier — ce skill est 100% lecture seule + formatage
- Si aucun commit aujourd'hui : le dire clairement ("0 commits aujourd'hui")
