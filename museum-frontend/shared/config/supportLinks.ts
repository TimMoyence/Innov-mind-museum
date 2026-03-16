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

export const isValidSupportUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
};
