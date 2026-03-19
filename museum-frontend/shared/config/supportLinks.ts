/** Contact channel URLs and handles for user support (Instagram, Telegram). */
export const SUPPORT_LINKS = {
  instagram: {
    label: 'Instagram',
    /** TODO: Replace with real production Instagram handle once created. */
    url: 'https://instagram.com/musaium_support',
    handle: '@musaium_support',
    ready: false,
  },
  telegram: {
    label: 'Telegram',
    url: 'https://t.me/musaium_support',
    handle: '@musaium_support',
    ready: true,
  },
} as const;

/** Checks whether the given string is a valid HTTPS URL suitable for a support link. */
export const isValidSupportUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
};
