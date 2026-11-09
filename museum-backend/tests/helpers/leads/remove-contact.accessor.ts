export interface RemoveContactOutcome {
  outcome: string;
}

type RemoveContactFn = (email: string) => Promise<RemoveContactOutcome | void>;

export function getRemoveContact(notifier: object): RemoveContactFn | undefined {
  const candidate = (notifier as Record<string, unknown>).removeContact;
  if (typeof candidate !== 'function') return undefined;
  return (candidate as RemoveContactFn).bind(notifier);
}
