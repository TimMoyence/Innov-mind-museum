import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';

class RecordingOrchestrator implements ChatOrchestrator {
  readonly inputs: OrchestratorInput[] = [];

  async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    this.inputs.push(input);
    return { text: 'Réponse du guide sur la Joconde.', metadata: {} };
  }
}

const USER_ID = 4242;
const EMAIL = 'jean.dupont@mail.fr';
const PHONE = '06 12 34 56 78';
const IBAN = 'FR76 3000 6000 0112 3456 7890 189';
const CARD = '4970 1012 3456 7890';

describe('RAZ-M12-PII', () => {
  it('RAZ-M12-PII · email, téléphone, IBAN et carte saisis au tour N-1 n’arrivent jamais en clair au LLM, ni au tour N', async () => {
    const orchestrator = new RecordingOrchestrator();
    const service = buildChatTestService({ orchestrator });
    const session = await service.createSession({ userId: USER_ID });

    await service.postMessage(
      session.id,
      {
        text: `Parle-moi de la Joconde. Écris-moi à ${EMAIL} ou au ${PHONE}, IBAN ${IBAN}, carte ${CARD}.`,
      },
      undefined,
      USER_ID,
    );
    await service.postMessage(session.id, { text: 'Et qui l’a peinte ?' }, undefined, USER_ID);

    expect(orchestrator.inputs).toHaveLength(2);
    const sentToLlm = JSON.stringify(
      orchestrator.inputs.map((input) => ({ text: input.text, history: input.history })),
    );
    expect(sentToLlm).toContain('Joconde');
    expect(sentToLlm).toContain('[EMAIL]');
    expect(sentToLlm).toContain('[IBAN]');
    expect(sentToLlm).toContain('[CARD]');
    expect(sentToLlm).not.toContain(EMAIL);
    expect(sentToLlm).not.toContain(PHONE);
    expect(sentToLlm).not.toContain('3000 6000');
    expect(sentToLlm).not.toContain('4970 1012');
  });
});
