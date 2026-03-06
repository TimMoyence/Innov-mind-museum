export const SUPPORT_LINKS = {
  instagram: {
    label: 'Instagram',
    url: 'https://instagram.com/museumia_support',
    handle: '@museumia_support',
  },
  telegram: {
    label: 'Telegram',
    url: 'https://t.me/museumia_support',
    handle: '@museumia_support',
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
