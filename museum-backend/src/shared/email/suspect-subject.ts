export function tagSuspect(subject: string, suspect: boolean | undefined): string {
  return suspect === true ? `[suspect] ${subject}` : subject;
}
