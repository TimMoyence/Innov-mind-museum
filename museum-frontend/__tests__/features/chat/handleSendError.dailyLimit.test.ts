import { handleSendError } from '@/features/chat/application/sendStrategies/sendStrategy.shared';
import type { SendMessageContext } from '@/features/chat/application/sendStrategies/sendStrategy.types';
import { createAppError } from '@/shared/types/AppError';

const makeContext = () => {
  const setDailyLimitReached = jest.fn();
  const setError = jest.fn();
  const context = {
    setIsStreaming: jest.fn(),
    resetStreaming: jest.fn(),
    setMessages: jest.fn(),
    setDailyLimitReached,
    setError,
  } as unknown as SendMessageContext;
  return { context, setDailyLimitReached, setError };
};

describe('LIMITE-CODE', () => {
  it('LIMITE-CODE · seule une erreur de type DailyLimitReached bloque le chat ; une erreur dont le texte cite DAILY_LIMIT_REACHED affiche son message', () => {
    const limit = makeContext();
    handleSendError(
      createAppError({ kind: 'DailyLimitReached', message: 'Daily chat limit reached' }),
      'm1',
      limit.context,
    );
    expect(limit.setDailyLimitReached).toHaveBeenCalledWith(true);
    expect(limit.setError).not.toHaveBeenCalled();

    const text = makeContext();
    handleSendError(new Error('Server: DAILY_LIMIT_REACHED — try tomorrow'), 'm2', text.context);
    expect(text.setDailyLimitReached).not.toHaveBeenCalled();
    expect(text.setError).toHaveBeenCalledTimes(1);
  });
});
