// Portfolio pedido para el monitor de Nacho.
// Las lineas genericas se atan a contexto para evitar productos de terceros.

const BRAND_DEFINITIONS = [
  { name: 'los sorchantes', aliases: ['los sorchantes', 'sorchantes'] },
  { name: 'tia rosa', aliases: ['tia rosa'] },
  { name: 'bimbo', aliases: ['bimbo'] },
  { name: 'rapiditas', aliases: ['rapiditas'] },
  { name: 'artesano', aliases: ['artesano'], requiresBimboContext: true },
  { name: 'maestro cubano', aliases: ['maestro cubano', 'el maestro cubano'] },
  { name: 'merienda hit', aliases: ['merienda hit', 'hit merienda'] },
  { name: 'merienda xl', aliases: ['merienda xl', 'xl merienda'] },
  { name: 'takis', aliases: ['takis'] },
  { name: 'salmas', aliases: ['salmas', 'sanissimo salmas', 'sanisimo salmas'], include: isSalmasPack },
  { name: 'nutrabien', aliases: ['nutrabien', 'nutra bien'] },
];

export const BRAND_GROUPS = {
  bimbo: BRAND_DEFINITIONS.map((b) => b.name),
};

export const ALL_BRANDS = BRAND_GROUPS.bimbo;

export const SEARCH_TERMS = [
  'los sorchantes',
  'sorchantes',
  'tia rosa',
  'bimbo',
  'rapiditas',
  'artesano bimbo',
  'maestro cubano',
  'merienda hit',
  'merienda xl',
  'takis',
  'salmas',
  'salmas 6',
  'salmas 12',
  'tostaditas salmas',
  'nutrabien',
  'nutra bien',
];

function stripAccents(s) {
  return String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function isSalmasPack(norm) {
  if (!/\bsalmas\b/i.test(norm)) return false;
  return /\b(?:x\s*)?(?:6|12)\s*(?:u|un|unid|unidades)?\b/i.test(norm)
    || /\b(?:108|216)\s*(?:g|gr|gramos)\b/i.test(norm);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasPattern(alias) {
  return stripAccents(alias)
    .toLowerCase()
    .split(/\s+/)
    .map(escapeRegex)
    .join('[\\s-]+');
}

const MATCHERS = BRAND_DEFINITIONS.flatMap((brand) =>
  brand.aliases.map((alias) => ({
    brand: brand.name,
    requiresBimboContext: Boolean(brand.requiresBimboContext),
    include: brand.include,
    weight: brand.requiresBimboContext ? 1 : 0,
    length: alias.length,
    rx: new RegExp(`\\b${aliasPattern(alias)}\\b`, 'i'),
  })),
).sort((a, b) => (b.weight - a.weight) || (b.length - a.length));

const STRONG_MATCHERS = MATCHERS.filter((m) => !m.requiresBimboContext);

export function matchedBrand(text) {
  if (!text) return null;
  const norm = stripAccents(text).toLowerCase();
  const hasBimboContext = STRONG_MATCHERS.some((m) => m.rx.test(norm));
  const match = MATCHERS.find((m) => {
    if (m.requiresBimboContext && !hasBimboContext) return false;
    if (m.include && !m.include(norm)) return false;
    return m.rx.test(norm);
  });
  return match?.brand ?? null;
}

export function brandGroup(brand) {
  return ALL_BRANDS.includes(brand) ? 'bimbo' : null;
}
