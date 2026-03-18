/** Contact channel URLs and handles for user support (Instagram, Telegram). */
export const SUPPORT_LINKS = {
  instagram: {
    label: 'Instagram',
    url: 'https://instagram.com/musaium_support',
    handle: '@musaium_support',
  },
  telegram: {
    label: 'Telegram',
    url: 'https://t.me/musaium_support',
    handle: '@musaium_support',
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
