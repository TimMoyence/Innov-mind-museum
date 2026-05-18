# PGP key for `security@musaium.com` — generation + publication

**Audience:** Musaium founder.
**Goal:** Produce a usable PGP key for encrypted vulnerability submissions, publish the public key at the URL advertised in `SECURITY.md` (`https://musaium.com/.well-known/pgp-key.txt`), and keep the private key offline.
**Source of truth:** [`SECURITY.md`](../../SECURITY.md) §"PGP / encrypted reports".
**Last updated:** 2026-05-17. **Audit run:** `2026-05-17-w4-compliance-ops-release`.
**TL executes** — keypair generation MUST happen on a trusted machine; the private key never leaves it.

---

## 1. Why a PGP key at all

Sophisticated researchers (and competing vendors) reach out via encrypted email when the finding is high-impact (auth bypass with PoC, payment-data leak, supply-chain compromise PoC). Refusing to accept encrypted reports filters out exactly the researchers you want to hear from — they will not paste a working exploit in cleartext to an unknown party.

`security.txt` (RFC 9116) recommends the `Encryption:` header point to a stable URL serving the ASCII-armored public key. We currently advertise the URL `https://musaium.com/.well-known/pgp-key.txt` but the file ships as a placeholder; this runbook closes that gap.

## 2. Key parameters

| Parameter | Value | Why |
|---|---|---|
| Algorithm | Ed25519 (signing) + Curve25519 (encryption) | Modern, fast, small, supported by GnuPG ≥ 2.1.17, OpenPGP.js, Sequoia. RSA-4096 acceptable fallback if Ed25519 not supported by your tooling but no reason to prefer it. |
| UID | `Musaium Security <security@musaium.com>` | Stable. NOT founder personal name — the key must outlive founder departure. |
| Expiration | **2 years** | Forces rotation hygiene. Renew with same key (extend expiry), do not generate a fresh key unless the private key is compromised. |
| Passphrase | 6-word diceware (EFF list), minimum 80 bits entropy | Stored in 1Password `Musaium / Security` vault, item `pgp:security-mailbox-passphrase`. |
| Subkeys | Default (sign + encrypt subkeys) | Enables future revocation of the encrypt subkey without losing the primary identity. |

## 3. Generation procedure

> Run on a **trusted machine** (founder primary laptop with full-disk encryption + recent OS patches). NOT in CI, NOT in a Codespace, NOT in `museum-backend` container.

### 3.1 Prerequisites

```bash
gpg --version   # require gpg (GnuPG) >= 2.4.0 (Ed25519 native)
# macOS install if missing:  brew install gnupg
# Linux:                     apt install gnupg
```

### 3.2 Generate

```bash
gpg --quick-generate-key "Musaium Security <security@musaium.com>" ed25519 default 2y
# At the prompt, paste the diceware passphrase (then store in 1Password).
```

Capture the key fingerprint:

```bash
gpg --list-keys --fingerprint security@musaium.com
# Expected output similar to:
#   pub   ed25519 2026-05-17 [SC] [expires: 2028-05-17]
#         AAAA BBBB CCCC DDDD EEEE  FFFF 1111 2222 3333 4444
#   uid           [ultimate] Musaium Security <security@musaium.com>
#   sub   cv25519 2026-05-17 [E] [expires: 2028-05-17]
```

Note the fingerprint (40-hex format, spaces every 4 chars for human reading).

### 3.3 Export the public key

```bash
gpg --armor --export security@musaium.com > pgp-key.txt
wc -l pgp-key.txt   # expect ~14 lines for an Ed25519 key
head -1 pgp-key.txt # expect: -----BEGIN PGP PUBLIC KEY BLOCK-----
tail -1 pgp-key.txt # expect: -----END PGP PUBLIC KEY BLOCK-----
```

### 3.4 Back up the private key (offline)

```bash
gpg --armor --export-secret-keys security@musaium.com > security-private.asc
# Copy to TWO encrypted USB sticks. Store one in founder's home safe, one in
# a different physical location (e.g. bank deposit box, trusted family).
# Delete the local file after copying:
shred -u security-private.asc   # Linux
rm -P security-private.asc      # macOS (rm -P = overwrite)
```

Also generate a revocation certificate while you have the private key handy:

```bash
gpg --armor --gen-revoke security@musaium.com > security-revoke.asc
# Store with the private key backups. NEVER commit, NEVER paste into chat.
```

### 3.5 Publish the public key

Replace the placeholder at `museum-web/public/.well-known/pgp-key.txt` with the contents of `pgp-key.txt`:

```bash
cat pgp-key.txt > /path/to/InnovMind-W4/museum-web/public/.well-known/pgp-key.txt
```

Then update `SECURITY.md` and `museum-web/public/.well-known/security.txt`:

**`SECURITY.md`** — replace the `PGP key fingerprint will be published at` paragraph with the real fingerprint:

```markdown
**PGP / encrypted reports:** PGP public key — <https://musaium.com/.well-known/pgp-key.txt>.
Fingerprint: `AAAA BBBB CCCC DDDD EEEE  FFFF 1111 2222 3333 4444` (verify before
encrypting). Key algorithm: Ed25519. Expires: 2028-05-17.
```

**`security.txt`** — uncomment and fill the `Encryption:` line:

```
Encryption: https://musaium.com/.well-known/pgp-key.txt
```

Bump the `security.txt` `Expires:` field if more than 30 days from now have passed — RFC 9116 wants it ≥ 6 months but ≤ 1 year ahead.

### 3.6 Smoke test

From a separate machine (or a test Gmail with `mailvelope` extension), encrypt a one-line test message to `security@musaium.com` using the published key:

```bash
gpg --import https://musaium.com/.well-known/pgp-key.txt
echo "test message $(date)" | gpg --encrypt -r security@musaium.com -a > test.asc
# Email contents of test.asc to security@musaium.com.
```

From the founder's machine, decrypt:

```bash
cat test.asc | gpg --decrypt
# Expect: "test message <today's date>"
```

Screenshot the round-trip success for the PR evidence.

## 4. Rotation policy

| Trigger | Action | Window |
|---|---|---|
| Key expiry approaching (≤ 30 days) | Extend expiry +2 years, re-export, re-publish, bump fingerprint NOWHERE (same key) | Calendar reminder at 2028-04-17 |
| Suspected private-key compromise | Revoke (publish `security-revoke.asc`), generate fresh key, update fingerprint everywhere | Within 24 h |
| Founder departure | Generate fresh key under successor identity, dual-publish old + new for 30 days, then revoke old | Within 7 days of departure |
| Algorithm deprecation (e.g. Ed25519 broken) | Generate fresh key with new algorithm | At advisory publication |

## 5. Where the fingerprint must appear

Single source of truth = `SECURITY.md`. Mirror locations:

| Location | Owner | Update cadence |
|---|---|---|
| `SECURITY.md` §"PGP / encrypted reports" | this runbook | on rotation |
| `museum-web/public/.well-known/pgp-key.txt` | this runbook | on rotation |
| `museum-web/public/.well-known/security.txt` `Encryption:` line | this runbook | on rotation |
| `museum-web/src/app/[locale]/security/page.tsx` (if rendered) | web maintainer | on rotation |
| Sub-processor agreements / DPA addenda (if applicable) | legal | on rotation, with notice |

`SECURITY.md` is the canonical place; everywhere else mirrors it. Drift on any of these = launch-blocking under UFR-013 (we are advertising a fingerprint that doesn't match the real key).

## 6. Done = ?

TA5 (C8.5) is closed when:

- [ ] Keypair generated on founder trusted machine with the parameters in §2.
- [ ] Private key + revocation certificate backed up to 2 encrypted offline locations.
- [ ] Passphrase stored in 1Password `Musaium / Security` vault.
- [ ] Public key copy committed at `museum-web/public/.well-known/pgp-key.txt`.
- [ ] `SECURITY.md` fingerprint paragraph updated with the real 40-hex fingerprint.
- [ ] `security.txt` `Encryption:` line uncommented and pointing to the published key.
- [ ] Round-trip encrypt/decrypt smoke captured as evidence in the PR.
- [ ] Calendar reminder set for `2028-04-17` (key expiry -30 d).

Until then, `security.txt` carries a stale `# Encryption: PGP key TBD` comment and `SECURITY.md` carries an aspirational paragraph — that is exactly the "advertisement without backing" that UFR-013 forbids.
