const FALLBACK = 'unknown';

export const extractEmailDomain = (email: string): string => {
  const trimmed = email.trim();
  const lastAt = trimmed.lastIndexOf('@');
  if (lastAt === -1) return FALLBACK;

  const domain = trimmed.slice(lastAt + 1).toLowerCase();
  if (domain.length === 0) return FALLBACK;

  return domain;
};
