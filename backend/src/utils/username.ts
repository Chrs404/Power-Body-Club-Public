/**
 * Genera uno username base da nome e cognome: "Mario Rossi" -> "mario.rossi".
 * Rimuove accenti e caratteri non alfanumerici.
 */
export function buildUsernameBase(firstName: string, lastName: string): string {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const first = normalize(firstName);
  const last = normalize(lastName);
  const base = [first, last].filter(Boolean).join('.');

  return base || 'cliente';
}

/**
 * Restituisce il primo username libero: mario.rossi, mario.rossi2, ...
 * "taken" e' l'insieme degli username gia' esistenti che iniziano per base.
 */
export function pickAvailableUsername(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}${suffix}`)) {
    suffix++;
  }
  return `${base}${suffix}`;
}
