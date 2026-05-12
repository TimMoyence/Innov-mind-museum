# 18 — Bloc 9 : iOS 26 React-bridge crash instrumentation + RN bump

> **Pour qui ?** Toi, qui veux comprendre pourquoi on a ajouté du Swift natif "logphase" partout dans `AppDelegate.swift` et pourquoi c'est lié à un crash iPhone 16 Pro / iOS 26.
> **Durée de lecture :** ~8 minutes.

---

## Le contexte

Depuis ~mars 2026, des users sur iPhone 16 Pro / iPhone 17 Pro (puce A18 Pro) sous iOS 26.x rapportent un crash 0.14-0.29 seconde après le lancement de l'app. Le stacktrace remonté à Sentry est inutile :

```
SIGABRT
0  __cxa_rethrow
1  objc_exception_rethrow
2  ...
```

Aucune ligne nous indiquant **où** dans notre code RN/Expo c'est pété. Le bridge React Native s'initialise, et 200ms plus tard l'app meurt sans laisser de trace.

C'est tracké dans la mémoire `project_ios26_crash_investigation.md` et l'ADR-004 documente la situation.

---

## Le problème en une phrase

Le crash se passe **avant** que React Native + Sentry RN n'aient eu le temps de s'initialiser, donc tu n'as **aucune trace** de ce qui se passe exactement.

---

## Analogie : la boîte noire d'un avion

Imagine un avion qui s'écrase 5 secondes après le décollage, mais sans boîte noire qui enregistre les actions du pilote. Tu vois juste "l'avion est tombé". Impossible de réparer.

L'instrumentation = la **boîte noire**. Elle n'empêche pas le crash, mais elle enregistre ce qui se passait juste avant. Tu lis l'enregistrement post-incident, tu sais où ça plante.

---

## Vocabulaire iOS / RN

| Terme | Définition |
|-------|------------|
| **AppDelegate.swift** | Le fichier Swift qui définit le cycle de vie de l'app iOS (lancement, background, foreground, terminate). |
| **React bridge** | Le pont qui relie le code Swift natif au runtime JavaScript de React Native. Initialisé au boot de l'app. |
| **TurboModule** | Nouveau système de bridge RN (plus rapide que l'ancien). En partie responsable du crash A18 Pro. |
| **NSSetUncaughtExceptionHandler** | API iOS pour intercepter les exceptions Objective-C non catched. |
| **NSTemporaryDirectory** | Dossier temporaire iOS, persistant entre les boots. Idéal pour log post-mortem. |
| **Hermes** | Le moteur JS optimisé pour RN (alternative à JavaScriptCore). Soupçonné dans le crash. |

---

## Ce qu'on a ajouté

### Native side (Swift)

`museum-frontend/ios/Musaium/AppDelegate.swift` — un module `RNCrashCapture` qui :

1. **Installe un handler global** pour les exceptions non-catched.
2. **Logge des "phases"** à chaque étape critique du boot.

Extrait :

```swift
enum RNCrashCapture {
  static func installHandlers() {
    NSSetUncaughtExceptionHandler { exception in
      RNCrashCapture.handleUncaughtException(exception)
    }
  }

  static func logPhase(_ phase: String, details: [String: Any] = [:]) {
    // 1. Append ISO-8601 entry to NSTemporaryDirectory()/musaium-crash-context.json
    // 2. Mirror to NSLog [MUSAIUM_INIT] for Console.app live debugging
    // 3. If Sentry is enabled, addBreadcrumb category=rn.init
  }
}
```

Et dans `application(_, didFinishLaunchingWithOptions:)` :

```swift
RNCrashCapture.installHandlers()
RNCrashCapture.logPhase("appDelegate.didFinishLaunching.start")
// ... création du react bridge ...
RNCrashCapture.logPhase("rn.factory.created")
// ... création de la window ...
RNCrashCapture.logPhase("rn.window.created")
// ... démarrage de RN ...
RNCrashCapture.logPhase("rn.startReactNative.before")
// ... après ...
RNCrashCapture.logPhase("rn.startReactNative.after")
// ... retour de la méthode ...
RNCrashCapture.logPhase("appDelegate.didFinishLaunching.return", details: ["superResult": result])
```

### Que fait le handler en cas de crash

Quand `NSSetUncaughtExceptionHandler` se déclenche, on capture :
- **`phaseAtCrash`** : la dernière phase logged → on sait à quelle étape c'est pété.
- **Exception name + reason + userInfo** : le contenu Objective-C de l'exception.
- **`callStack` + return addresses** : le stacktrace natif.
- **`bridge.moduleClasses`** : la liste des modules natifs RN registered au moment du crash. Critique pour identifier "ah, c'est tel TurboModule qui n'a pas chargé".
- **Hermes env hint** : Hermes activé ou pas.

Tout est écrit dans `NSTemporaryDirectory()/musaium-crash-context.json` (append-only) + miroir NSLog.

### Pourquoi NSTemporaryDirectory et pas Sentry ?

Parce que **Sentry RN n'est peut-être pas initialisé** au moment du crash (le crash se passe **avant** le moment où Sentry RN startup). Si on dépendait de Sentry pour persister, on perdrait le log.

Le file in NSTemporaryDirectory **survit** au crash et au redémarrage. Au prochain boot de l'app, on peut lire ce fichier (s'il existe) et l'envoyer à Sentry.

### JavaScript side

`museum-frontend/shared/observability/init-phase-breadcrumbs.ts` — une fonction `logInitPhase(phase, data?)` qui :
- Émet `console.log [MUSAIUM_INIT] js.<phase>` (visible dans Metro logs / Xcode console).
- Si Sentry RN est dispo, `Sentry.addBreadcrumb({ category: 'rn.init', ... })`.

Wired dans `app/_layout.tsx` :
- `post-initSentry` (Sentry est up).
- `rootLayout.mounted` (le composant root a monté).
- `navigationContainer.registered` (le router est prêt).
- `runtimeSettings.applied` (les settings runtime ont été appliqués).

### Pourquoi les deux côtés (Swift + JS)

Le crash peut se passer côté **natif** (avant que JS ne tourne) ou côté **JS** (pendant l'init React). On instrumente les deux pour ne rater aucun cas.

---

## Le RN bump 0.83.4 → 0.83.6

Le sprint a aussi bumpé React Native de 0.83.4 à 0.83.6 (patch bump). Pourquoi ?

- **Bug fixes upstream** : la 0.83.6 inclut des fixes pour iOS 26 / A18 Pro.
- **Symétrie codegen** : les nouveaux Pods 0.83.6 expectent une certaine structure de headers (`React-jsinspectortracing/jsinspector-modern/tracing/`). L'ancien Pods 0.83.4 avait des headers à plat — divergence entre le code natif et les Podspecs.

Important : `package.json` était **déjà à 0.83.6**. Le sprint a juste bump les **Pods iOS** pour aligner avec.

---

## Pourquoi c'est pertinent pour Musaium

### V1 launch sans diagnostic = bombe

Si tu lances V1 et que des users iPhone 16/17 Pro ne peuvent pas ouvrir l'app, **tu ne peux pas réparer** sans diagnostic. Tu peux juste leur dire "désolé, on regarde". Avec l'instrumentation, le prochain user qui crash envoie son `musaium-crash-context.json` à Sentry, tu lis "phaseAtCrash = rn.startReactNative.before, modules registered = X, Y, Z", tu identifies le coupable en 1 jour au lieu de 1 mois.

### Pas un fix, un détecteur

L'instrumentation **ne corrige pas** le crash. Elle te donne les données pour le corriger. C'est important de bien le distinguer.

Le fix lui-même viendra ensuite : selon ce qu'on apprend, ce sera soit :
- Un patch RN amont (PR upstream).
- Un workaround dans `AppDelegate.swift` (ex : delay l'init d'un module).
- Un bump à RN 0.84+ quand il sera dispo.

### ADR-027 — Sentry RN 8.9.1 shipped

En complément, Sentry RN a été bumpé de `8.7` à `8.9.1`. Cette version fix :
- **Hermes silent event-drop** : sur Hermes, des events Sentry étaient silencieusement perdus. Fix.
- **Expo 55 Metro lazy-load** : Sentry était lazy-loaded de façon incorrecte avec Expo 55 Metro bundler. Fix.

---

## Limite honnête

L'instrumentation ne capture pas tout. Si le crash se passe **avant** `installHandlers()` (dans les premières µs du boot), on rate. Mais c'est rare — typiquement le crash A18 Pro se passe ~140-290 ms après start, largement après installHandlers.

---

## Est-ce overkill ?

**Non, c'est minimum vital pour un launch mobile sans crash visibility.** Coût d'implémentation : ~150 LOC Swift + ~50 LOC TS. Coût runtime : ~5 ms par phase logged (négligeable).

L'alternative (lancer V1 en aveugle) = potentiellement perdre tous les users iPhone Pro pendant des semaines.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Build et push une version EAS internal avec l'instrumentation | À valider que les phases s'affichent en Xcode console |
| Ouvrir Xcode → Window → Devices and Simulators → View Device Logs | Pour voir les `[MUSAIUM_INIT]` en temps réel sur device de test |
| Au prochain crash report Sentry | Vérifier que `phaseAtCrash` est dans le payload (= instrumentation fait son boulot) |
| Si tu n'as pas d'iPhone 16 Pro / 17 Pro | Demander à un user beta de te faire parvenir son `musaium-crash-context.json` |
| Lire `ADR-004-ios26-a18pro-crash-watch.md` | Doc canonique du status investigation |

---

## Note longue durée

L'investigation iOS 26 / A18 Pro est **ouverte**. Tant qu'on n'a pas le fix root cause, l'instrumentation est notre seul moyen de progresser. **Garde-la activée même quand le crash sera fixed** — pour les futurs crashs (iOS 27, iPhone 18, etc.), le pattern d'instrumentation est réutilisable.
