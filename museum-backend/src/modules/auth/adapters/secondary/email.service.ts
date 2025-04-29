/**
 * Vérifie le format d'une adresse e-mail.
 * @param email L'adresse e-mail à valider
 * @returns true si l'adresse est valide, false sinon
 */
export function validateEmail(email: string): boolean {
  // Cette regex n'est pas parfaite, mais couvre la plupart des cas courants.
  // Pour une validation plus poussée, vous pourriez utiliser d'autres approches
  // ou des librairies dédiées.
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
