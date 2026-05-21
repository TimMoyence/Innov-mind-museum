/**
 * RED — UFR-022 phase=red, Cluster A (B6), RUN_ID=2026-05-21-p0-gdpr.
 *
 * Specifies the new `ThirdPartyAiConsentChecker` port (R1) and its factory
 * `buildThirdPartyAiConsentChecker()` (R7) mirroring `LocationConsentChecker`
 * (`location-resolver.ts:30-32`) + `buildLocationConsentChecker` (`chat-module.ts:834-838`).
 *
 * Pre-impl, the module path does NOT exist and these tests fail at dynamic
 * import. Once T1.6 lands the file + the factory, all four cases turn green.
 *
 * Lib-docs consulted: lib-docs/typeorm/LESSONS.md (repository pattern boundary;
 * the port stays pure-TS and the factory closes over the existing
 * `userConsentRepository.isGranted` — no parallel repo, no `.set(undefined)`).
 */

import { makeUserConsentRepo } from 'tests/helpers/auth/userConsent-repo.mock';
import {
  makeConsentGranted,
  makeConsentDenied,
  applyConsentGrantSpec,
} from 'tests/helpers/auth/consent.fixtures';

import type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';

const MODULE_PATH = '@modules/chat/useCase/third-party-ai-consent-checker';

/**
 * Type-level mirror of the expected port shape. Used only inside this test as
 * a doc anchor — the production interface lives in MODULE_PATH (R1).
 */
interface ExpectedPortShape {
  isGranted(userId: number | undefined | null, scope: string): Promise<boolean>;
}

type ExpectedModuleShape = {
  buildThirdPartyAiConsentChecker: (repoOverride?: IUserConsentRepository) => ExpectedPortShape;
};

async function loadModule(): Promise<ExpectedModuleShape> {
  // Dynamic import so the test file itself loads cleanly even when MODULE_PATH
  // is absent — the assertion is then made against the rejection inside the
  // test body, producing a meaningful jest failure rather than a transitive
  // suite-load crash that masks the real RED signal.
  const mod = (await import(MODULE_PATH)) as unknown as ExpectedModuleShape;
  return mod;
}

describe('ThirdPartyAiConsentChecker — port + factory (R1, R7, D3)', () => {
  it('exports a buildThirdPartyAiConsentChecker factory function', async () => {
    const mod = await loadModule();
    expect(typeof mod.buildThirdPartyAiConsentChecker).toBe('function');
  });

  it('returns an object with exactly one method named "isGranted"', async () => {
    const { buildThirdPartyAiConsentChecker } = await loadModule();
    const checker = buildThirdPartyAiConsentChecker();
    expect(typeof checker.isGranted).toBe('function');
    // exactly one own method (or method on prototype) — no surface creep
    const ownKeys = Object.keys(checker).filter(
      (k) => typeof (checker as unknown as Record<string, unknown>)[k] === 'function',
    );
    expect(ownKeys).toEqual(['isGranted']);
  });

  it('isGranted returns true when an active grant exists for the (userId, scope) pair', async () => {
    const { buildThirdPartyAiConsentChecker } = await loadModule();
    const repo = makeUserConsentRepo();
    await applyConsentGrantSpec(
      repo,
      makeConsentGranted({ userId: 42, scope: 'third_party_ai_text_openai' }),
    );

    const checker = buildThirdPartyAiConsentChecker(repo);
    await expect(checker.isGranted(42, 'third_party_ai_text_openai')).resolves.toBe(true);
  });

  it('isGranted returns false when no grant row exists (denied = absence of grant)', async () => {
    const { buildThirdPartyAiConsentChecker } = await loadModule();
    const repo = makeUserConsentRepo();
    // applyConsentGrantSpec(makeConsentDenied(...)) is intentionally NOT called —
    // the test exercises the "no row" branch, which the spec treats as denial.
    void makeConsentDenied({ userId: 42, scope: 'third_party_ai_image_openai' });

    const checker = buildThirdPartyAiConsentChecker(repo);
    await expect(checker.isGranted(42, 'third_party_ai_image_openai')).resolves.toBe(false);
  });

  it('isGranted returns false for a revoked grant (revokedAt set)', async () => {
    const { buildThirdPartyAiConsentChecker } = await loadModule();
    const repo = makeUserConsentRepo();
    await applyConsentGrantSpec(
      repo,
      makeConsentGranted({ userId: 42, scope: 'third_party_ai_audio_openai' }),
    );
    await repo.revoke(42, 'third_party_ai_audio_openai');

    const checker = buildThirdPartyAiConsentChecker(repo);
    await expect(checker.isGranted(42, 'third_party_ai_audio_openai')).resolves.toBe(false);
  });

  it('D3 fail-CLOSED — isGranted(undefined, scope) returns false (anonymous user)', async () => {
    const { buildThirdPartyAiConsentChecker } = await loadModule();
    const repo = makeUserConsentRepo();
    const checker = buildThirdPartyAiConsentChecker(repo);
    // mirror the design §9 D3 default: anon = refused, no DB call required.
    await expect(
      checker.isGranted(undefined as unknown as number, 'third_party_ai_text_openai'),
    ).resolves.toBe(false);
  });

  it('D3 fail-CLOSED — isGranted(null, scope) returns false', async () => {
    const { buildThirdPartyAiConsentChecker } = await loadModule();
    const repo = makeUserConsentRepo();
    const checker = buildThirdPartyAiConsentChecker(repo);
    await expect(
      checker.isGranted(null as unknown as number, 'third_party_ai_text_openai'),
    ).resolves.toBe(false);
  });

  it('isGranted closes over a repository (R7 — no parallel repo created)', async () => {
    const { buildThirdPartyAiConsentChecker } = await loadModule();
    // sentinel repo: the factory MUST consult our injected isGranted, not a
    // freshly-instantiated one. This guards against an impl that accidentally
    // bypasses the override.
    const calls: Array<{ userId: number; scope: string }> = [];
    const sentinelRepo: IUserConsentRepository = {
      grant: jest.fn() as unknown as IUserConsentRepository['grant'],
      revoke: jest.fn() as unknown as IUserConsentRepository['revoke'],
      listForUser: jest.fn() as unknown as IUserConsentRepository['listForUser'],
      isGranted: jest.fn().mockImplementation(async (userId: number, scope: string) => {
        calls.push({ userId, scope });
        return await Promise.resolve(true);
      }) as unknown as IUserConsentRepository['isGranted'],
    };

    const checker = buildThirdPartyAiConsentChecker(sentinelRepo);
    await checker.isGranted(7, 'third_party_ai_profile_google');
    expect(calls).toEqual([{ userId: 7, scope: 'third_party_ai_profile_google' }]);
  });
});
