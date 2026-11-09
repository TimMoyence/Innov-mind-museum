export const formatAppDate = (
  iso: string,
  language: string,
  options: Intl.DateTimeFormatOptions,
): string | null => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(language, options).format(date);
};
