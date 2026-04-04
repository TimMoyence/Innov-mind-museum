export const extractUserIdFromToken = (accessToken: string): string | null => {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1])) as Record<string, unknown>;
    const userId = (payload.id ?? payload.sub) as string | number | undefined;
    return userId ? String(userId) : null;
  } catch {
    return null;
  }
};
