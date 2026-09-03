/**
 * Concept type ids come from the bundle, so any display name has to be derived rather
 * than looked up — a hardcoded map would be bundle-specific and break the white-label
 * flip the moment a bundle introduces a type it doesn't know.
 */
export function humanizeType(type: string): string {
  const s = type.replace(/[-_]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : type;
}

/**
 * Pluralise a display name. Concept types come from the bundle, so this has to be a rule
 * rather than a lookup: "policy" → "Policies", not "Policys".
 */
export function pluralizeType(type: string): string {
  const one = humanizeType(type);
  if (/[^aeiou]y$/i.test(one)) return `${one.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(one)) return `${one}es`;
  return `${one}s`;
}
