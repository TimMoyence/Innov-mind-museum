export const meta = {
  name: 'qa-fix-fresh-context',
  description: 'Cycle de correction fresh-context (UFR-022) pour UN retour QA — un agent frais par phase',
  phases: [
    { title: 'Spec' },
    { title: 'Plan' },
    { title: 'Red' },
    { title: 'Green' },
    { title: 'Review' },
  ],
}

// ── Fix descriptor (passé via args) ───────────────────────────────────────────
// { id, title, depth:'light'|'full', workdir, runDir, qaNotesPath, qaNotesSection,
//   brief, testRunCmd, moduleTestCmd, gateCmds:[...], filesHint:[...] }
// args peut arriver soit en objet, soit en chaîne JSON (quirk du tool Workflow) → parse défensif.
const fix = typeof args === 'string' ? JSON.parse(args) : args
const RUN = fix.runDir

const GUARDRAILS = [
  'GARDE-FOUS NON NÉGOCIABLES (appris le 2026-05-30) :',
  '- RTK OFF : source de vérité = git. Après CHAQUE édition, vérifie via `git diff --stat <fichier>` que la modif a bien atterri sur disque. Ne fais JAMAIS confiance au seul "updated successfully".',
  '- Une opération sensible à la fois (pas de batch annulable en cascade).',
  '- Tests jest : `npx jest --clearCache` AVANT chaque run (cache stale = piège connu). Tests node:test : `TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test <file>`.',
  '- Honnêteté UFR-013 : rapporte tout échec/erreur/sortie VERBATIM. Distingue "le code dit X" (vérifié) de "j\'attends X". "Je ne sais pas" est valide.',
  '- Arbre principal (pas worktree). NE COMMITE PAS — le Tech Lead (orchestrateur) commite. Toi tu édites + vérifies + rapportes.',
  '- museum-frontend : PAS d\'emoji unicode (PNG require / Ionicons only). RTL : props logiques (marginStart/End, paddingStart/End, textAlign:center autorisé, jamais Left/Right). Voir CLAUDE.md § Pièges connus.',
  '- Tests : factories DRY partagées (jamais d\'objet inline `as Type`). Voir docs/TEST_FACTORIES.md.',
  '- ESLint : pas de eslint-disable sauf vrai faux-positif justifié (>=20 chars + Approved-by).',
  '- "Jamais de faux contenu" : ne seed/affiche aucune donnée inventée. Champ absent → état vide/skeleton, pas de placeholder mensonger.',
  '- Si tu vois un message d\'une autre phase du même run, émets `BLOCK-CONTEXT-LEAK` et refuse (fresh-context).',
].join('\n')

const SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['specPath', 'summary', 'acceptanceCriteria'],
  properties: {
    specPath: { type: 'string' },
    summary: { type: 'string' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    nfrs: { type: 'array', items: { type: 'string' } },
    filesInScope: { type: 'array', items: { type: 'string' } },
  },
}

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['designPath', 'tasksPath', 'filesToTouch', 'summary'],
  properties: {
    designPath: { type: 'string' },
    tasksPath: { type: 'string' },
    filesToTouch: { type: 'array', items: { type: 'string' } },
    contractChange: { type: 'boolean' },
    summary: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' } },
  },
}

const RED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['testFiles', 'redProvedFail', 'failOutput', 'summary'],
  properties: {
    testFiles: { type: 'array', items: { type: 'string' } },
    manifest: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['path', 'sha256'], properties: { path: { type: 'string' }, sha256: { type: 'string' } } } },
    redProvedFail: { type: 'boolean' },
    failOutput: { type: 'string' },
    discriminationProof: { type: 'string' },
    summary: { type: 'string' },
  },
}

const GREEN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sourceFilesChanged', 'testsUntouched', 'jestPass', 'tscExit', 'eslintExit', 'summary'],
  properties: {
    sourceFilesChanged: { type: 'array', items: { type: 'string' } },
    testsUntouched: { type: 'boolean' },
    jestPass: { type: 'boolean' },
    jestOutput: { type: 'string' },
    tscExit: { type: 'integer' },
    eslintExit: { type: 'integer' },
    extraSteps: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'findings', 'gatesGreen', 'summary'],
  properties: {
    verdict: { type: 'string', enum: ['APPROVED', 'CHANGES_REQUESTED', 'BLOCK'] },
    findings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'detail'], properties: { severity: { type: 'string' }, file: { type: 'string' }, detail: { type: 'string' } } } },
    gatesGreen: { type: 'boolean' },
    acceptanceMet: { type: 'boolean' },
    summary: { type: 'string' },
  },
}

const cdHint = fix.workdir ? `Répertoire de travail : \`${fix.workdir}\` (cd dedans pour les commandes npm/jest/tsc/eslint).` : 'Répertoire de travail : racine du repo.'

const common = [
  GUARDRAILS,
  '',
  `### Fix ${fix.id} — ${fix.title}`,
  cdHint,
  `Diagnostic source de vérité (LIS-LE) : \`${fix.qaNotesPath}\` section ${fix.qaNotesSection}. Chaque file:line y est code-vérifié.`,
  `Brief : ${fix.brief}`,
].join('\n')

// ── SPEC + PLAN (depth=full uniquement) ───────────────────────────────────────
if (fix.depth === 'full') {
  phase('Spec')
  await agent(
    [
      common,
      '',
      'PHASE SPEC (architecte, fresh-context). Lis le diagnostic QA + les fichiers source concernés (Read/Grep). NE PRODUIS NI CODE NI DESIGN.',
      `Écris une spec EARS dans \`${RUN}/spec.md\` : exigences (WHEN/THE SYSTEM SHALL), NFR (dont "jamais de faux contenu", RTL, no-emoji, GDPR si pertinent, contrat OpenAPI si cross-stack), glossaire, critères d\'acceptation testables, parties prenantes.`,
      `Vérifie que le fichier a atterri (\`git diff --stat ${RUN}/spec.md\` ou \`ls -la\`). Retourne specPath + summary + acceptanceCriteria[] + nfrs[] + filesInScope[].`,
    ].join('\n'),
    { phase: 'Spec', label: `${fix.id}:spec`, schema: SPEC_SCHEMA },
  )

  phase('Plan')
  await agent(
    [
      common,
      '',
      `PHASE PLAN (architecte, fresh-context — ZÉRO mémoire de la phase Spec). Lis \`${RUN}/spec.md\` depuis le disque + les fichiers source.`,
      `Produis \`${RUN}/design.md\` (approche, fichiers à toucher, changements de contrat, étapes OpenAPI/regénération de types si applicable, ordre back→front) + \`${RUN}/tasks.md\` (tâches ordonnées, granularité commit-séparé).`,
      'Vérifie que les 2 fichiers ont atterri. Retourne designPath + tasksPath + filesToTouch[] + contractChange + summary + risks[].',
    ].join('\n'),
    { phase: 'Plan', label: `${fix.id}:plan`, schema: PLAN_SCHEMA },
  )
}

// ── RED ───────────────────────────────────────────────────────────────────────
phase('Red')
const planRef = fix.depth === 'full' ? `Lis aussi \`${RUN}/design.md\` + \`${RUN}/spec.md\`.` : ''
const red = await agent(
  [
    common,
    '',
    `PHASE RED (éditeur de tests, fresh-context). ${planRef}`,
    'Écris UN OU PLUSIEURS tests qui ÉCHOUENT et qui prouvent le bug / l\'absence du comportement voulu. N\'ÉCRIS AUCUN code d\'implémentation (uniquement des tests).',
    'Utilise les factories DRY existantes (étends-les si besoin, sans casser les tests existants).',
    `Lance les tests via : \`${fix.testRunCmd}\` et CONFIRME un exit ≠ 0. Capture la sortie d\'échec VERBATIM (l\'assertion qui pète).`,
    'Si le test passerait aussi sur l\'ancien code (tautologie), reconçois-le pour qu\'il DISCRIMINE (échoue avant le fix, passera après). Donne une preuve de discrimination (raisonnement ou mini-script).',
    'Calcule le sha256 de chaque fichier de test créé/modifié (`shasum -a 256 <file>`) → manifest [{path,sha256}] (frozen-test : la phase Green ne devra PAS les modifier).',
    'Vérifie via `git diff --stat` que tes tests ont atterri. Retourne testFiles[] + manifest[] + redProvedFail + failOutput + discriminationProof + summary.',
  ].join('\n'),
  { phase: 'Red', label: `${fix.id}:red`, schema: RED_SCHEMA },
)

// ── GREEN (+ boucle review illimitée) ─────────────────────────────────────────
phase('Green')
let green = await agent(
  [
    common,
    '',
    'PHASE GREEN (éditeur d\'implémentation, fresh-context — ZÉRO mémoire de la phase Red). Lis le diff des tests rouges via `git diff` + (si full) `' + RUN + '/design.md`.',
    'Écris l\'implémentation MINIMALE qui rend les tests verts. NE MODIFIE AUCUN fichier de test (frozen-test byte-for-byte). Si tu crois un test faux, émets `BLOCK-TEST-WRONG <file>:<line> <raison>` SANS le toucher et arrête-toi.',
    'Si le contrat change (cross-stack) : mets à jour OpenAPI puis régénère les types FE (`cd museum-frontend && npm run generate:openapi-types`) et liste ces étapes dans extraSteps.',
    `Lance les gates et rapporte les exit codes RÉELS (pas le global d\'une chaîne ;) : (1) suite module entière \`${fix.moduleTestCmd}\` → DOIT être verte ; (2) ${fix.gateCmds.join(' ; ')}.`,
    'Vérifie via `git diff --stat` que TON code a atterri ET que les fichiers de test sont inchangés (compare au manifest red). Retourne sourceFilesChanged[] + testsUntouched + jestPass + jestOutput + tscExit + eslintExit + extraSteps[] + summary.',
  ].join('\n'),
  { phase: 'Green', label: `${fix.id}:green`, schema: GREEN_SCHEMA },
)

phase('Review')
let verdict
let loops = 0
while (true) {
  verdict = await agent(
    [
      common,
      '',
      'PHASE REVIEW (reviewer, fresh-context). Lis le diff COMPLET (`git diff` + `git diff --cached` si applicable) + (si full) `' + RUN + '/spec.md`.',
      'Vérifie INDÉPENDAMMENT en relançant toi-même : la suite du MODULE ENTIER (`' + fix.moduleTestCmd + '`), ' + fix.gateCmds.join(' ; ') + '. Lis chaque exit code.',
      'Contrôle : critères d\'acceptation tenus ; AUCUN test existant cassé (un changement de contrat partagé casse des tests adjacents — élargis le scope de vérif) ; RTL/no-emoji/DRY-factories/ESLint-discipline respectés ; "jamais de faux contenu" ; frozen-test (fichiers de test inchangés depuis le manifest red).',
      'Verdict : APPROVED (tout vert + acceptance tenue) | CHANGES_REQUESTED (findings actionnables) | BLOCK (test faux / fuite de contexte). Cite file:line dans les findings. Retourne verdict + findings[] + gatesGreen + acceptanceMet + summary.',
    ].join('\n'),
    { phase: 'Review', label: `${fix.id}:review#${loops + 1}`, schema: REVIEW_SCHEMA },
  )
  if (verdict.verdict === 'APPROVED') break
  loops++
  log(`${fix.id} review #${loops}: ${verdict.verdict} — ${verdict.summary}`)
  if (loops > 6) {
    log(`${fix.id}: ${loops} boucles review — escalade au Tech Lead (arrêt de la boucle auto).`)
    break
  }
  // Re-spawn GREEN frais pour adresser les findings (reviewer rejection loop illimité UFR-022).
  green = await agent(
    [
      common,
      '',
      'PHASE GREEN (re-spawn fresh-context après CHANGES_REQUESTED). Lis le diff courant via `git diff`.',
      'Adresse ces findings de review : ' + JSON.stringify(verdict.findings),
      'NE MODIFIE AUCUN fichier de test (frozen) sauf `BLOCK-TEST-WRONG`. Relance les gates et rapporte les exit codes réels.',
      'Vérifie via `git diff --stat` que les corrections ont atterri. Retourne sourceFilesChanged[] + testsUntouched + jestPass + jestOutput + tscExit + eslintExit + extraSteps[] + summary.',
    ].join('\n'),
    { phase: 'Green', label: `${fix.id}:green-fix#${loops}`, schema: GREEN_SCHEMA },
  )
}

return { fix: fix.id, depth: fix.depth, red, green, verdict, reviewLoops: loops }
