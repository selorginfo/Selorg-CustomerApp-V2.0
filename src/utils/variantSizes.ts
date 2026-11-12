export type SizeOption = {
  id?: string;
  size?: string | null;
  quantity?: string | null;
  price?: number | null;
  classification?: string | null;
};

const PACK_CONTAINERS = ['multipack', 'bundle', 'bottle', 'pouch', 'jar', 'tin', 'can', 'tub', 'pack'];

function packContainer(label: string): string {
  const s = String(label || '').toLowerCase();
  for (const container of PACK_CONTAINERS) {
    if (s.includes(container)) return container;
  }
  return '';
}

/** "100 ml", "100ML Pouch", "1 Ltr Bottle" → "100ml" / "1l" so the same measure compares equal. */
export function normalizeVariantSizeKey(label: string): string {
  let s = String(label || '').trim().toLowerCase().replace(/\s+/g, '');
  for (const container of PACK_CONTAINERS) s = s.replace(new RegExp(container, 'g'), '');
  s = s
    .replace(/(\d)(grams?|gms?|gm)$/, '$1g')
    .replace(/(\d)kgs?$/, '$1kg')
    .replace(/(\d)(litres?|liters?|ltrs?|lt)$/, '$1l')
    .replace(/(\d)mls?$/, '$1ml')
    .replace(/(\d)(pieces?|pcs?)$/, '$1pc');
  return s;
}

function sizeKey(row: SizeOption): string {
  const label = String(row.size || row.quantity || '').trim();
  const id = String(row.id || '');
  if (!label) return `id:${id}`;
  return normalizeVariantSizeKey(label) || `id:${id}`;
}

function hasPositivePrice(price: unknown): boolean {
  const n = Number(price);
  return Number.isFinite(n) && n > 0;
}

function optionLabel(row: SizeOption): string {
  return String(row.size || row.quantity || '');
}

function preferOption(candidate: SizeOption, current: SizeOption, preferId?: string, preferredContainer?: string): boolean {
  const cid = String(candidate.id || '');
  const xid = String(current.id || '');
  if (preferId && cid === preferId && xid !== preferId) return true;
  if (preferId && xid === preferId && cid !== preferId) return false;
  if (preferredContainer) {
    const cMatch = packContainer(optionLabel(candidate)) === preferredContainer;
    const xMatch = packContainer(optionLabel(current)) === preferredContainer;
    if (cMatch && !xMatch) return true;
    if (xMatch && !cMatch) return false;
  }
  const cPriced = hasPositivePrice(candidate.price);
  const xPriced = hasPositivePrice(current.price);
  if (cPriced && !xPriced) return true;
  if (xPriced && !cPriced) return false;
  return candidate.classification === 'Style' && current.classification !== 'Style';
}

/**
 * One option per pack size from the product detail payload.
 * Keeps the opened product's row, otherwise the row that actually has a price.
 */
export function dedupeSizeOptions<T extends SizeOption>(rows: T[] | null | undefined, preferId?: string): T[] {
  if (!Array.isArray(rows) || rows.length < 2) return Array.isArray(rows) ? rows : [];
  const preferred = preferId ? rows.find(row => row && String(row.id || '') === preferId) : undefined;
  const preferredContainer = preferred ? packContainer(optionLabel(preferred)) : '';
  const best = new Map<string, T>();
  const order: string[] = [];
  for (const row of rows) {
    if (!row) continue;
    const key = sizeKey(row);
    const existing = best.get(key);
    if (!existing) {
      best.set(key, row);
      order.push(key);
      continue;
    }
    if (preferOption(row, existing, preferId, preferredContainer)) best.set(key, row);
  }
  return order.map(key => best.get(key) as T);
}
