/**
 * T8.1 (RED — Cycle B « Aucun lead perdu », Phase 8 — UFR-022 fresh-context red).
 *
 * No-leak contract for the persisted `Lead.lastError` (spec R16, design §7,
 * Constraints sécurité, NFR Privacy(c)). When the Brevo notifier throws, the
 * use-case records `lastError`. That recorded value MUST be sanitised:
 *   (a) it MUST NOT contain the Brevo api-key (or any `xkeysib-*` fragment),
 *   (b) it MUST NOT contain the lead's FULL email (PII discipline — the email
 *       already lives in `payload`; `lastError` must not duplicate it as a
 *       second, log-bound copy that escapes the erasure path), and
 *   (c) it stays bounded (≤ 800 chars, mirror `brevo-*.notifier.ts:.slice(0,800)`).
 *
 * Threat model: a Brevo (or transport) error message can embed the recipient
 * email and — in a misconfigured client or a future error shape — the api-key
 * header value. The current B-core `markFailed(id, err.message.slice(0, 800))`
 * stores the notifier message VERBATIM (sliced only). So when the upstream
 * error message echoes the email / api-key, that PII/secret is persisted into
 * `lastError` → these assertions FAIL (RED). The green phase sanitises the
 * stored error (strip api-key + full email) before persistence.
 *
 * Maps: R16, Constraints sécurité, NFR Privacy(c).
 *
 * Test discipline (CLAUDE.md §Test Discipline) — payload via `makeB2bLeadPayload()`,
 * repository double via the shared `makeStubLeadRepository()` factory. No BullMQ
 * instantiated (use-case level only — handler-pure, lib-docs/bullmq/LESSONS).
 */
import { SubmitB2bLeadUseCase } from '@modules/leads/useCase/submitB2bLead.useCase';
import { SubmitBetaSignupUseCase } from '@modules/leads/useCase/submitBetaSignup.useCase';

import { makeB2bLeadPayload } from '../../helpers/leads/b2bLead.fixtures';
import { makeBetaSignupPayload } from '../../helpers/leads/betaSignup.fixtures';
import { makeStubLeadRepository } from '../../helpers/leads/stubLeadRepository';

import type { B2bLeadNotifier } from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import type { BetaSignupNotifier } from '@modules/leads/domain/ports/beta-signup-notifier.port';

const FAKE_API_KEY = 'xkeysib-0123456789abcdef-leak-canary';
const LEAD_EMAIL = 'prospect.leak@museum.example.fr';

/**
 * A notifier whose error message embeds BOTH the api-key and the lead's full
 * email — the worst-case upstream error shape the sanitiser must defang.
 */
function leakyB2bNotifier(): B2bLeadNotifier {
  return {
    notify: jest.fn(async () => {
      throw new Error(
        `Brevo send failed (401) api-key=${FAKE_API_KEY} recipient=${LEAD_EMAIL} body=unauthorized`,
      );
    }),
  };
}

function leakyBetaNotifier(): BetaSignupNotifier {
  return {
    subscribe: jest.fn(async () => {
      throw new Error(
        `Brevo contacts add failed (401) api-key=${FAKE_API_KEY} email=${LEAD_EMAIL}`,
      );
    }),
  };
}

describe('Leads security — Lead.lastError never leaks api-key / full email (R16, NFR Privacy)', () => {
  it('B2B: lastError contains neither the api-key nor the full email', async () => {
    const repo = makeStubLeadRepository();
    const useCase = new SubmitB2bLeadUseCase(leakyB2bNotifier(), repo);

    await useCase.execute(makeB2bLeadPayload({ email: LEAD_EMAIL }));

    expect(repo.failed).toHaveLength(1);
    const lastError = repo.failed[0]?.lastError ?? '';
    expect(lastError).not.toContain(FAKE_API_KEY);
    expect(lastError).not.toContain('xkeysib');
    expect(lastError).not.toContain(LEAD_EMAIL);
  });

  it('B2B: lastError stays bounded (≤ 800 chars)', async () => {
    const repo = makeStubLeadRepository();
    const longTail = 'x'.repeat(5000);
    const notifier: B2bLeadNotifier = {
      notify: jest.fn(async () => {
        throw new Error(`Brevo 503 ${longTail}`);
      }),
    };
    const useCase = new SubmitB2bLeadUseCase(notifier, repo);

    await useCase.execute(makeB2bLeadPayload({ email: LEAD_EMAIL }));

    const lastError = repo.failed[0]?.lastError ?? '';
    expect(lastError.length).toBeLessThanOrEqual(800);
  });

  it('beta: lastError contains neither the api-key nor the full email', async () => {
    const repo = makeStubLeadRepository();
    const useCase = new SubmitBetaSignupUseCase(leakyBetaNotifier(), repo);

    await useCase.execute(makeBetaSignupPayload({ email: LEAD_EMAIL }));

    expect(repo.failed).toHaveLength(1);
    const lastError = repo.failed[0]?.lastError ?? '';
    expect(lastError).not.toContain(FAKE_API_KEY);
    expect(lastError).not.toContain('xkeysib');
    expect(lastError).not.toContain(LEAD_EMAIL);
  });
});
