const WIKIMEDIA_HOST = /(^|\.)(wikimedia|wikipedia|wikidata)\.org$/;
const CLEARTEXT = 'http:';

export const wikimediaHttps = <T extends string | null | undefined>(url: T): T => {
  if (typeof url !== 'string' || !url.startsWith(CLEARTEXT)) return url;
  try {
    if (!WIKIMEDIA_HOST.test(new URL(url).hostname)) return url;
  } catch {
    return url;
  }
  return `https:${url.slice(CLEARTEXT.length)}` as T;
};
