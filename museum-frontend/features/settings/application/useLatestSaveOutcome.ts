import { useCallback, useRef, useState } from 'react';

export const useLatestSaveOutcome = () => {
  const [refusals, setRefusals] = useState<Readonly<Record<string, Error>>>({});
  const [saved, setSaved] = useState(false);
  const latest = useRef<Record<string, number>>({});

  const track = useCallback(
    async (write: Promise<Error | null>, setting = ''): Promise<Error | null | undefined> => {
      const mine = (latest.current[setting] ?? 0) + 1;
      latest.current[setting] = mine;
      setRefusals(({ [setting]: _replaced, ...others }) => others);
      setSaved(false);
      const outcome = await write;
      if (mine !== latest.current[setting]) return undefined;
      if (outcome) setRefusals((current) => ({ ...current, [setting]: outcome }));
      setSaved(outcome === null);
      return outcome;
    },
    [],
  );

  return { refusal: Object.values(refusals)[0] ?? null, saved, track };
};
