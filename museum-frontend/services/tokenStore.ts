let accessToken = '';

export const setAccessToken = (token: string | null | undefined): void => {
  accessToken = token ? token : '';
};

export const getAccessToken = (): string => accessToken;

export const clearAccessToken = (): void => {
  accessToken = '';
};

export const hasAccessToken = (): boolean => accessToken.length > 0;
