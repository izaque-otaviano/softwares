export type ClassValue = string | number | false | null | undefined | ClassValue[] | Record<string, boolean | null | undefined>;

/** Junta classes ignorando valores falsos. Sem tailwind-merge: os tokens próprios (text-sm, text-fg) conflitam nele. */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue): void => {
    if (!v && v !== 0) return;
    if (typeof v === 'string' || typeof v === 'number') out.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else for (const [k, on] of Object.entries(v)) if (on) out.push(k);
  };
  values.forEach(walk);
  return out.join(' ');
}
