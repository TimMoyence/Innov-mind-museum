import { makeUserConsentRepo } from 'tests/helpers/auth/userConsent-repo.mock';
import {
  makeConsentGranted,
  makeConsentDenied,
  applyConsentGrantSpec,
} from 'tests/helpers/auth/consent.fixtures';

import type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';

const MODULE_PATH = '@modules/chat/useCase/third-party-ai-consent-checker';

interface ExpectedPortShape {
  isGranted(userId: number | undefined | null, scope: string): Promise<boolean>;
}

type ExpectedModuleShape = {
  buildThirdPartyAiConsentChecker: (repoOverride?: IUserConsentRepository) => ExpectedPortShape;
};

async function loadModule(): Promise<ExpectedModuleShape> {
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
