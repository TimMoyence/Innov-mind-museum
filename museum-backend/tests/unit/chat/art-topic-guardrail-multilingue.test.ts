/**
 * F4 (2026-04-30) — multilingual insult coverage.
 *
 * Closes the asymmetry where INSULT_KEYWORDS only covered FR + EN while
 * INJECTION_PATTERNS covered 8 languages. Adds DE / ES / IT / JA / ZH / AR
 * representative entries (>=3 per language) and validates negative controls
 * (legit art questions in same languages) still pass.
 */
import { evaluateUserInputGuardrail } from '@modules/chat/useCase/guardrail/art-topic-guardrail';

describe('evaluateUserInputGuardrail — multilingual insult coverage (F4)', () => {
  describe('blocks insults in 8 languages', () => {
    // English — already covered, sanity check
    it.each([['idiot'], ['stupid'], ['fuck']])('blocks EN insult %s', (text) => {
      expect(evaluateUserInputGuardrail({ text })).toEqual({
        allow: false,
        reason: 'insult',
      });
    });

    // French — already covered, sanity check
    it.each([['connard'], ['salope'], ['ta gueule']])('blocks FR insult %s', (text) => {
      expect(evaluateUserInputGuardrail({ text })).toEqual({
        allow: false,
        reason: 'insult',
      });
    });

    // German
    it.each([
      ['Du bist ein Arschloch'],
      ['So eine Scheisse, dieses Bild'],
      ['Hurensohn, halt die Klappe'],
    ])('blocks DE insult %s', (text) => {
      expect(evaluateUserInputGuardrail({ text })).toEqual({
        allow: false,
        reason: 'insult',
      });
    });

    // Spanish
    it.each([['eres un pendejo'], ['vete a la mierda'], ['callate gilipollas'], ['hijo de puta']])(
      'blocks ES insult %s',
      (text) => {
        expect(evaluateUserInputGuardrail({ text })).toEqual({
          allow: false,
          reason: 'insult',
        });
      },
    );

    // Italian
    it.each([
      ['sei uno stronzo'],
      ['vaffanculo a chi te morto'],
      ['figlio di puttana'],
      ['che coglione'],
    ])('blocks IT insult %s', (text) => {
      expect(evaluateUserInputGuardrail({ text })).toEqual({
        allow: false,
        reason: 'insult',
      });
    });

    // Japanese
    it.each([['お前はバカだ'], ['クソくらえ'], ['死ねよ'], ['くたばれクソ野郎']])(
      'blocks JA insult %s',
      (text) => {
        expect(evaluateUserInputGuardrail({ text })).toEqual({
          allow: false,
          reason: 'insult',
        });
      },
    );

    // Chinese
    it.each([['你是个傻逼'], ['操你妈'], ['白痴东西'], ['去死吧']])(
      'blocks ZH insult %s',
      (text) => {
        expect(evaluateUserInputGuardrail({ text })).toEqual({
          allow: false,
          reason: 'insult',
        });
      },
    );

    // Arabic
    it.each([['انت احمق'], ['يا غبي'], ['تبا لك'], ['اخرس يا كلب']])(
      'blocks AR insult %s',
      (text) => {
        expect(evaluateUserInputGuardrail({ text })).toEqual({
          allow: false,
          reason: 'insult',
        });
      },
    );
  });

  describe('negative controls: legit art questions stay allowed in 8 languages', () => {
    it.each([
      ['EN', 'Tell me more about Monet impressionism'],
      ['FR', 'Parlez-moi de la Joconde'],
      ['DE', 'Erzähle mir von der Mona Lisa'],
      ['ES', '¿Puedes explicarme el cubismo de Picasso?'],
      ['IT', 'Raccontami della Cappella Sistina'],
      ['JA', '葛飾北斎の富嶽三十六景について教えてください'],
      ['ZH', '请告诉我关于故宫博物院的事情'],
      ['AR', 'أخبرني عن متحف اللوفر في باريس'],
    ])('allows legit %s art question', (_lang, text) => {
      expect(evaluateUserInputGuardrail({ text })).toEqual({ allow: true });
    });
  });
});
