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

---

## 2026-05-20 — Refresh audit (RHF 7.74.0 / resolvers 5.2.2)

**Verdict: ✅ PASS — all 2026-05-18 REJECT findings remediated. Forms refactored (ADR-025) since the prior audit.**

The single-file `app/auth.tsx` glorified-useState bag is gone. Form is now: root orchestrator (`app/auth.tsx`) holding only `control/handleSubmit/getValues/reset`, with `LoginForm`/`RegisterForm` rendering `<Controller>` inputs.

### Findings closed (verified at refresh)
- **F2 (was CRITICAL — errors never displayed): CLOSED.** Each `Controller` reads `fieldState.error` and passes `error?.message` to `FormInput`, which renders `<Text accessibilityRole="alert" accessibilityLiveRegion="polite">` + `errorTestID` (`shared/ui/FormInput.tsx:162-171`). Zod errors now surface inline.
- **F1/F6 (was HIGH — watch+setValue re-render storm): CLOSED.** Root no longer uses top-level `watch`. Per-field subscriptions live in `Controller`; submit-gating uses scoped `useWatch` in `RegisterSubmit` (gdprAccepted + dateOfBirth) and `SocialLoginButtonsGate` (gdprAccepted). No keystroke re-render of the orchestrator.
- **F3 (was HIGH — handleSubmit bypassed): CLOSED.** `onLoginSubmit`/`onRegisterSubmit` = `void handleSubmit(() => handleLogin/Register())()` (`app/auth.tsx:155-161`). Resolver gates submission; `shouldFocusError` (default) restored.
- **F4 (was MEDIUM — dateOfBirth missing from defaults): CLOSED.** `AUTH_FORM_DEFAULTS` includes `dateOfBirth: ''` (`authFormSchema.ts:30-37`).

### DOB-2026-05-17 — permanent lesson (still load-bearing)
- `dateOfBirth` schema uses `.refine((raw) => raw === '' || parseDateOfBirth(raw) !== null)`, NOT a single-format regex. `parseDateOfBirth` accepts `YYYY-MM-DD` + `DD/MM/YYYY` + `DD-MM-YYYY` + `DD.MM.YYYY` (FR iOS keyboard default). The original bug was `^\d{4}-\d{2}-\d{2}$` rejecting FR civic format → submit disabled. **Never reintroduce a single-format DOB regex.** FE parse is a UX format-check only; backend re-validates + computes age (CNIL Délib. 2021-018, 15y).
- UFR-021 enforcement is real: `.maestro/auth-submit-invalid-email.yaml` asserts the inline `auth-email-error` appears and the form does NOT submit. `auth-register-minor-dob.yaml` covers the under-15 path. Jest alone would have passed the original DOB bug (it mocked the input). Any new auth field MUST ship a Maestro tap-through flow.

### Still-true defensive notes
- RN: `field.onChange` → `TextInput.onChangeText` (NOT `onChange` — RN passes the raw string, not a SyntheticEvent). Wired correctly via `FormInput.onChangeText`.
- `getValues` (not `watch`) passed to `useForgotPassword({ getEmail })` so email is read at click time, no subscription. Good.
- `@hookform/resolvers@5.2.2` is the latest; auto-dispatches Zod 4 — no migration. RHF latest is 7.76.0 (7.74→7.76 = bug-fix + additive only, no breaking change, no advisory). Bump optional, not urgent.

### Watch items (not blocking)
- RHF is used in EXACTLY ONE form (auth). No profile/MFA RHF form. If a second form lands, factor a shared `FormInput`-based `Controller` field component (already half-there in `shared/ui/FormInput.tsx`) rather than re-deriving the wiring.
- BE/FE keep independent Zod schemas for the same domain objects (login/register). Drift risk — DOB-2026-05-17 was the symptom. `@musaium/shared` does not export schemas yet (re-evaluate V1.1).
