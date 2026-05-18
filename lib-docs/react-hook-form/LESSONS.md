# Lessons — react-hook-form + @hookform/resolvers (v7.74 + v5.2)

Audit 2026-05-18 : **🚨 REJECT — RHF utilisé comme glorified useState bag**.

C'est exactement le bug class **DOB-2026-05-17** que UFR-021 doit prévenir. Le unit test passerait, mais le user-facing form silently swallow validation.

## 🚨 F2 CRITICAL : `formState.errors` JAMAIS lu → Zod validation runs but errors NEVER displayed
- `museum-frontend/app/auth.tsx:71` : `const { watch, setValue } = useForm(...)` — pas de `formState`, pas de `handleSubmit`.
- Schema `email/password/dateOfBirth refine` runs → errors silently discarded.
- User type `99/99/9999` → no inline message ever appears.
- **Fix TD-RHF-01** : destructure `handleSubmit, control, formState: { errors }`. Surface `<Text role='alert'>{errors.X?.message}</Text>`.

## 🚨 F1 HIGH : useForm bypassed avec watch+setValue
- 6 top-level watch() subscriptions → full re-render of AuthScreen + ALL children sur CHAQUE keystroke.
- Avec Controller wiring INSIDE child inputs, only affected input re-renders — RHF main perf feature negated.
- **Fix TD-RHF-02** : migrate each TextInput to `<Controller name=... control={control} render={({field}) => <TextInput onBlur={field.onBlur} onChangeText={field.onChange} value={field.value} />} />`.

## 🚨 F3 HIGH : `handleSubmit` NEVER used → schema BYPASSED at submit time
- L257 `onSubmit={() => { void handleLogin(); }}` — bypass resolver.
- User can submit invalid email / short password / unparseable DOB → relies on backend rejection.
- `handleSubmit` also focuses first errored field (shouldFocusError default true) — also lost.
- `useEmailPasswordAuth.handleRegister` does its OWN parseDateOfBirth (CLAUDE.md DOB-2026-05-17 bug context) = duplication the schema was meant to obviate.
- **Fix TD-RHF-03** : `onSubmit={handleSubmit(handleLogin)}`.

## ⚠️ F4 MEDIUM : `dateOfBirth` missing from defaultValues
- L74 defaults={email,password,firstname,lastname,gdprAccepted} — missing dateOfBirth.
- L81 patches with `?? ''` (PATTERNS says fix source, not read site).
- **Fix** : add `dateOfBirth: ''` to defaultValues.

## ⚠️ F6 MEDIUM : Re-render storm (6 watch() at root)
- Covered by F1 fix (Controller migrates child inputs → root no longer watches).

## 🚨 UFR-021 Action requise
- **Add Maestro flow** : "submit auth with invalid email" qui assert inline error visible. Closes UFR-021 gap pour validation UX.

## ✅ Positives (only the bone)
- L73 `mode: 'onBlur'` explicit
- L72 `zodResolver` import correct
- L55 `type AuthFormValues = z.infer<typeof authSchema>` typed
- L74 defaultValues at useForm level (not per-field)
- @hookform/resolvers v5 auto-dispatches zod v4 schemas — works (no migration needed)
