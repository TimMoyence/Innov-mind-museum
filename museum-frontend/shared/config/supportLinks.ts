export interface SupportChannel {
  label: string;
  url: string;
  handle: string;
  ready: boolean;
}

export type SupportChannelKey = 'instagram' | 'telegram';

export const SUPPORT_LINKS: Record<SupportChannelKey, SupportChannel> = {
  instagram: {
    label: 'Instagram',
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
};

export const getReadySupportChannels = (): [SupportChannelKey, SupportChannel][] =>
  (Object.entries(SUPPORT_LINKS) as [SupportChannelKey, SupportChannel][]).filter(
    ([, channel]) => channel.ready,
  );

export const isValidSupportUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
};
