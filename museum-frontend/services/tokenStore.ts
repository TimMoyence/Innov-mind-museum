let accessToken = '';

/**
 * Stores the access token in memory.
 * @param token - JWT access token, or a nullish value to clear it.
 */
export const setAccessToken = (token: string | null | undefined): void => {
  accessToken = token ? token : '';
};

/** Returns the current in-memory access token (empty string when none is set). */
export const getAccessToken = (): string => accessToken;

/** Clears the in-memory access token. */
export const clearAccessToken = (): void => {
  accessToken = '';
};
