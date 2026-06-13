# CNIL personal-data-breach notification — dry-run

**Audience:** Musaium founder / DPO (until a delegate is appointed).
**Goal:** Confirm we can actually file a GDPR Article 33 (72 h) breach notification on `notifications.cnil.fr` BEFORE we are forced to do it for real under a 72-hour clock with no margin for portal friction.
**Source of truth for the public SLA:** [`SECURITY.md`](../../SECURITY.md) + [`VDP_RUNBOOK.md`](./VDP_RUNBOOK.md) §5.
**Last updated:** 2026-05-17. **Audit run:** `2026-05-17-w4-compliance-ops-release`.
**TL executes** — requires real CNIL credentials and a real (test) submission to a live regulator portal.

> ⚠️ **CNIL test environment** — the CNIL does not publish a sandbox. Dry-runs are performed against the production portal using the "**Brouillon**" (Draft) status only — you fill the form, save as draft, screenshot, and DELETE the draft. Never click "Soumettre" during the dry-run.

---

## 1. Pre-flight

| # | Check | Pass criterion |
|---|---|---|
| 1 | Founder has a personal `compte.particulier` FranceConnect / CNIL professional account | Can log in to <https://notifications.cnil.fr> without password reset |
| 2 | Musaium is registered in the CNIL "Registre des traitements" (ROPA) export | `docs/legal/ROPA.md` exists and matches the activities you would declare |
| 3 | Sub-processor list reflects production reality | `docs/legal/SUBPROCESSORS.md` last-updated ≤ 30 days |
| 4 | DPO contact info is decided (founder is acting DPO until a delegate) | Recorded in `docs/legal/DPIA.md` §"DPO" section |
| 5 | 1Password vault has the CNIL portal credentials | Item `cnil:notifications-portal` exists in `Musaium / Compliance` vault |
| 6 | Founder's mobile has the SMS 2FA enabled on the CNIL account | Tested by re-login in the last 7 days |

If any row fails → STOP, fix the gap, do not start the dry-run.

## 2. Dry-run scenario

Use this fictional but realistic scenario so the form fields exercise the real flow without ever filing a fake real breach:

> **Scenario** — On 2026-05-17 at 03:14 UTC, an internal log aggregation rule (`audit_log_pii_leak_detector`) flagged that, between 2026-05-15 09:00 UTC and 2026-05-15 09:42 UTC, a stale verbose-logging flag inadvertently included visitor email addresses in `museum-backend` request logs streamed to Sentry. ~120 email addresses were exposed to the Sentry organisation members (founder only). No external party received the data. Logs were purged within 30 minutes of detection, Sentry retention was scrubbed within 24 h. Mitigation: remove the verbose flag (commit `<fake-sha>`), add CI sentinel preventing reintroduction.

This scenario is small (< 500 affected), of one data type only (email), and contained internally → it would in fact NOT be CNIL-notifiable in production (Art. 33 §1 carve-out: low risk to rights and freedoms). But it gives us the full set of fields to exercise.

## 3. Step-by-step portal walkthrough

1. Go to <https://notifications.cnil.fr/notifications/index>. Log in.
2. Click **"Notifier une violation de données"** → **"Nouveau"**.
3. Section "Identité du responsable de traitement" — verify the pre-filled fields. Empty fields = STOP and call CNIL support; the dry-run uncovers the gap.
4. Section "Coordonnées du DPO" — fill in founder name + `dpo@musaium.com` (alias, → forward to `contact@musaium.com`). NOTE: this email alias must exist; if not, file `[TODO]` ticket to create it as part of C8.1 follow-up.
5. Section "Nature de la violation" — choose `confidentiality` only, with cause `dysfonctionnement applicatif` and `interne` = oui.
6. Section "Catégories de données" — `email` only.
7. Section "Catégories de personnes" — `prospects / visiteurs`.
8. Section "Nombre de personnes" — `120`.
9. Section "Mesures techniques" — paste:

   ```
   Détection : audit_log_pii_leak_detector (alerte interne).
   Endiguement : purge logs verbose + scrub Sentry retention (24h).
   Pérennité : flag retiré du déploiement, sentinelle CI ajoutée pour bloquer toute réintroduction (test couvrant le pattern).
   ```

10. Section "Conséquences probables" — `nulles à très limitées (exposition interne à un opérateur unique)`.
11. Section "Notification aux personnes concernées" — `non` (avec justification : "exposition interne contenue, risque résiduel négligeable, art. 34 §3.b").
12. **STOP** at the "Validation" step. Click **"Enregistrer comme brouillon"**. Screenshot the confirmation page.
13. Return to the "Mes notifications" list. Open the draft. Screenshot the draft row showing date + reference number.
14. Click **"Supprimer ce brouillon"** to delete the test entry. Confirm deletion. Screenshot the deletion confirmation.

## 4. Evidence to capture (PR description or `evidence/` folder)

- [ ] Screenshot login → CNIL portal dashboard.
- [ ] Screenshot of each section completed (sections 4 through 11), with the scenario header visible.
- [ ] Screenshot of the draft confirmation page (step 12).
- [ ] Screenshot of the draft visible in "Mes notifications" (step 13).
- [ ] Screenshot of the deletion confirmation (step 14).
- [ ] Console timestamp on each screenshot (system clock visible) — proves the dry-run is fresh.

## 5. Findings template (to fill after the dry-run)

```markdown
## CNIL dry-run findings — 2026-05-17

- Total wall-clock to complete form: __ min (target ≤ 25 min; otherwise the 72 h SLA has zero margin once you factor in detection + triage).
- Fields that surprised us / required ad-hoc copy: …
- Pre-filled gaps (e.g. DPO contact missing): …
- 2FA friction: …
- Recommendation to amend `VDP_RUNBOOK.md` §5 GDPR Article 33 protocol: …
```

Append the rendered finding to [`VDP_RUNBOOK.md`](./VDP_RUNBOOK.md) §5 as a dated case study so future operators read it.

## 6. Done = ?

TA2 (C8.2) is closed when:

- [ ] Login confirmed working (no password reset needed).
- [ ] All 14 walkthrough steps executed against the live portal in `brouillon` mode.
- [ ] All 6 evidence screenshots captured.
- [ ] Findings template filled and committed.
- [ ] `VDP_RUNBOOK.md` §5 amended with any new lesson learned.
- [ ] Draft deleted (the portal must NOT retain a fake breach record).

If the founder cannot log in (account not yet created or expired), TA2 is BLOCKED until C8.2-prereq "create CNIL pro account" is done — that becomes a 0.1 d add-on task before the dry-run.
