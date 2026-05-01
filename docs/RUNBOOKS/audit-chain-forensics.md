# Runbook — Audit Chain Forensics (post-restore verification)

**Owner**: Platform / SRE
**Date**: 2026-04-30 (initial)
**Audit ref**: `docs/security/2026-04-30-banking-grade-hardening-design.md` §8 Phase F

## Why this exists

The audit log table (`audit_logs`) carries a tamper-evident hash chain — each row's hash is computed over its content + the previous row's hash. After a Postgres restore (rollback, replica promotion, point-in-time recovery, or backup-from-backup), the chain MUST be re-verified end-to-end before the audit log can be trusted as forensic evidence.

A silent break in the chain (e.g. "this row's prev_hash doesn't match the previous row's hash") is the smoking gun for either (a) a tamper attempt, (b) a partial restore that dropped recent rows, or (c) a row insertion outside the application path (raw SQL).

## Pre-restore — capture the tail

Before initiating the restore (or as soon as the incident is detected), capture the current chain tail:

```sql
SELECT id, hash, prev_hash, created_at
  FROM audit_logs
  ORDER BY id DESC
  LIMIT 100;
```

Save the output to `incident-<DATE>/pre-restore-tail.txt`. This is the reference point against which the post-restore chain is compared.

## Post-restore — verify the chain

### 1. Point-in-time integrity

```sql
WITH chain AS (
  SELECT
    id,
    hash,
    prev_hash,
    LAG(hash) OVER (ORDER BY id) AS expected_prev_hash
  FROM audit_logs
)
SELECT id, hash, prev_hash, expected_prev_hash
FROM chain
WHERE prev_hash IS DISTINCT FROM expected_prev_hash
ORDER BY id;
```

**Expected**: zero rows. The first row of the chain has `prev_hash IS NULL` and `expected_prev_hash IS NULL` (no LAG), so it does not appear.

If any rows return: STOP. The chain is broken. File a `SEV-1` incident and notify legal + audit. Common causes: partial restore dropped intermediate rows; raw INSERT outside application path; backup taken mid-write.

### 2. Tail comparison

Diff the post-restore tail against the pre-restore tail captured above:

```bash
psql ... -c "SELECT id, hash, prev_hash FROM audit_logs ORDER BY id DESC LIMIT 100;" > incident-<DATE>/post-restore-tail.txt
diff -u incident-<DATE>/pre-restore-tail.txt incident-<DATE>/post-restore-tail.txt
```

**Expected** for a clean PITR restore: pre-tail's tail is a suffix of post-tail's chain (post-restore should include MORE rows or EQUAL set if PITR target = current time).

If post-tail is MISSING rows present in pre-tail: data loss. Investigate the restore parameters — the PITR target may have been earlier than expected.

### 3. Recompute hashes (sanity)

For a sample of 10 random rows, recompute the hash from `(payload, prev_hash)` and compare against the stored `hash` value:

```bash
node scripts/audit-chain-verify.cjs --rows 10
```

(Script TODO — Phase 2 deliverable; for now, the SQL recursive query in step 1 is the primary check; manual recomputation is reserved for spot-check during a SEV-1.)

## Outputs

After verification, file in `incident-<DATE>/`:

- `pre-restore-tail.txt` — captured BEFORE restore.
- `post-restore-tail.txt` — captured AFTER restore.
- `chain-verify.log` — output of the recursive query (must be empty).
- `notes.md` — operator log: timestamps, target restore point, verdict (PASS / WARN / FAIL).

If verdict = PASS, the audit log is restored to forensic-evidence quality. Append a record to `docs/RUNBOOKS/audit-chain-verification-log.md` (append-only ledger).

If verdict = WARN or FAIL, the chain is treated as evidence-tampered for the affected window. Notify legal; the next audit log entry is anchored to a new chain root with a comment.

## Frequency

- **MUST** run after every restore (PITR, backup-from-backup, replica promotion).
- **SHOULD** run nightly via cron as a sanity check (script TODO).
- **MAY** run on-demand when responding to an incident.

## References

- `museum-backend/src/shared/audit/audit-chain.ts` — chain implementation
- `museum-backend/src/data/db/migrations/*audit*` — schema
- [NIST SP 800-92](https://csrc.nist.gov/publications/detail/sp/800-92/final) — Guide to Computer Security Log Management
- SOC2 CC7.2 — System operations: incident detection / response
