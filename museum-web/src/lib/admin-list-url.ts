export const adminListUrl = (
  path: string,
  page: number,
  limit: number,
  filters: Record<string, string> = {},
): string => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return `${path}?${params.toString()}`;
};
