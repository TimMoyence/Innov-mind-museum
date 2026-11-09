import * as Sentry from '@sentry/react-native';

export const settleWrite = async (
  write: Promise<unknown>,
  flow: string,
  tags: Record<string, string> = {},
): Promise<Error | null> => {
  try {
    await write;
    return null;
  } catch (error: unknown) {
    Sentry.captureException(error, { tags: { ...tags, flow } });
    return error instanceof Error ? error : new Error(String(error));
  }
};

const forgetters = new Set<() => void>();

export const forgetAcceptedPreferences = (): void => {
  for (const forget of forgetters) forget();
};

export const accountPreference = <T>(save: (value: T) => Promise<Error | null>) => {
  let accepted: { value: T } | null = null;
  let latest: { value: T } | null = null;
  forgetters.add(() => {
    accepted = null;
  });

  return {
    accept: (value: T): void => {
      accepted = { value };
    },
    write: async (value: T, current: T, apply: (value: T) => void): Promise<Error | null> => {
      accepted ??= { value: current };
      const mine = { value };
      latest = mine;
      apply(value);
      const refusal = await save(value);
      if (!refusal) accepted = mine;
      if (latest === mine) apply(refusal ? accepted.value : value);
      return refusal;
    },
  };
};
