import { makeB2bLeadPayload } from '../../helpers/leads/b2bLead.fixtures';
import { makeBetaSignupPayload } from '../../helpers/leads/betaSignup.fixtures';
import { makePaywallInterestPayload } from '../../helpers/leads/paywallInterest.fixtures';
import { makeStubLeadRepository } from '../../helpers/leads/stubLeadRepository';
import { makeSupportContactInput } from '../../helpers/support/supportContact.fixtures';

import { SubmitB2bLeadUseCase } from '@modules/leads/useCase/submitB2bLead.useCase';
import { SubmitBetaSignupUseCase } from '@modules/leads/useCase/submitBetaSignup.useCase';
import { SubmitPaywallInterestUseCase } from '@modules/leads/useCase/submitPaywallInterest.useCase';
import { SubmitSupportContactUseCase } from '@modules/support/useCase/contact/submitSupportContact.useCase';

import type { B2bLeadPayload } from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import type { BetaSignupPayload } from '@modules/leads/domain/ports/beta-signup-notifier.port';
import type { SupportContactPayload } from '@modules/support/domain/ports/support-contact-notifier.port';

const TRAP = 'https://spam.example';
const FAST = 1_200;
const SLOW = 12_000;

describe('TIM-2026-11-08-DEUX-SIGNAUX · jeté seulement si champ caché rempli ET envoi rapide', () => {
  describe('contact support', () => {
    const notify = jest.fn<Promise<void>, [SupportContactPayload]>();
    const useCase = new SubmitSupportContactUseCase({ notify });

    beforeEach(() => {
      notify.mockReset();
      notify.mockResolvedValue(undefined);
    });

    it('champ caché vide et envoi lent : livré sans marque', async () => {
      await useCase.execute(makeSupportContactInput({ fillMs: SLOW }));

      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ suspect: false }));
    });

    it('champ caché rempli et envoi lent : livré marqué suspect', async () => {
      await useCase.execute(makeSupportContactInput({ website: TRAP, fillMs: SLOW }));

      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ suspect: true }));
    });

    it('champ caché vide et envoi rapide : livré marqué suspect', async () => {
      await useCase.execute(makeSupportContactInput({ fillMs: FAST }));

      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ suspect: true }));
    });

    it('champ caché vide sans délai mesuré : livré marqué suspect', async () => {
      await useCase.execute(makeSupportContactInput({ fillMs: undefined }));

      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ suspect: true }));
    });

    it('envoi à 5 000 ms pile : compté lent', async () => {
      await useCase.execute(makeSupportContactInput({ website: TRAP, fillMs: 5_000 }));

      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ suspect: true }));
    });

    it('champ caché rempli et envoi rapide : jeté, réponse normale', async () => {
      await expect(
        useCase.execute(makeSupportContactInput({ website: TRAP, fillMs: 4_999 })),
      ).resolves.toBeUndefined();

      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('lead B2B', () => {
    const notify = jest.fn<Promise<void>, [B2bLeadPayload]>();

    beforeEach(() => {
      notify.mockReset();
      notify.mockResolvedValue(undefined);
    });

    it('champ caché rempli et envoi lent : persisté et livré marqué suspect', async () => {
      const repository = makeStubLeadRepository();
      const useCase = new SubmitB2bLeadUseCase({ notify }, repository);

      await useCase.execute({ ...makeB2bLeadPayload({ website: TRAP }), fillMs: SLOW });

      expect(repository.inserted).toHaveLength(1);
      expect(repository.inserted[0]?.payload).toMatchObject({ suspect: true });
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ suspect: true }));
    });

    it('champ caché vide et envoi lent : livré sans marque', async () => {
      const useCase = new SubmitB2bLeadUseCase({ notify }, makeStubLeadRepository());

      await useCase.execute({ ...makeB2bLeadPayload(), fillMs: SLOW });

      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ suspect: false }));
    });

    it('champ caché rempli et envoi rapide : jeté sans persistance', async () => {
      const repository = makeStubLeadRepository();
      const useCase = new SubmitB2bLeadUseCase({ notify }, repository);

      await useCase.execute({ ...makeB2bLeadPayload({ website: TRAP }), fillMs: FAST });

      expect(repository.inserted).toHaveLength(0);
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('inscription bêta et intérêt paywall', () => {
    const subscribe = jest.fn<Promise<void>, [BetaSignupPayload]>();

    beforeEach(() => {
      subscribe.mockReset();
      subscribe.mockResolvedValue(undefined);
    });

    it('bêta : champ caché rempli et envoi lent : inscrit', async () => {
      const useCase = new SubmitBetaSignupUseCase({ subscribe }, makeStubLeadRepository());

      await useCase.execute({ ...makeBetaSignupPayload({ website: TRAP }), fillMs: SLOW });

      expect(subscribe).toHaveBeenCalledTimes(1);
    });

    it('bêta : champ caché rempli et envoi rapide : jeté', async () => {
      const useCase = new SubmitBetaSignupUseCase({ subscribe }, makeStubLeadRepository());

      await useCase.execute({ ...makeBetaSignupPayload({ website: TRAP }), fillMs: FAST });

      expect(subscribe).not.toHaveBeenCalled();
    });

    it('paywall : champ caché rempli et envoi lent : inscrit', async () => {
      const useCase = new SubmitPaywallInterestUseCase({ subscribe }, makeStubLeadRepository());

      await useCase.execute({ ...makePaywallInterestPayload({ website: TRAP }), fillMs: SLOW });

      expect(subscribe).toHaveBeenCalledTimes(1);
    });

    it('paywall : champ caché rempli sans délai mesuré : jeté', async () => {
      const useCase = new SubmitPaywallInterestUseCase({ subscribe }, makeStubLeadRepository());

      await useCase.execute(makePaywallInterestPayload({ website: TRAP }));

      expect(subscribe).not.toHaveBeenCalled();
    });
  });
});
