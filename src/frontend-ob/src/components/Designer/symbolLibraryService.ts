import type { SymbolCategory, SymbolDefinition } from './types';
import {
  LAZY_CATEGORY_META,
  loadCategoryLibrary,
  findCachedSymbol,
  resolveCategoryId,
  type LazyCategoryId,
} from './lazyCategoryRegistry';
import { getCustomSymbol } from './customSymbolRegistry';

/** Built-in (non-lazy) categories from SymbolPalette static section */
let staticCategories: SymbolCategory[] = [];

export function registerStaticCategories(categories: SymbolCategory[]): void {
  staticCategories = categories;
}

export function getLazyCategoryMeta() {
  return LAZY_CATEGORY_META;
}

export async function ensureCategoryLoaded(categoryId: LazyCategoryId): Promise<SymbolCategory> {
  return loadCategoryLibrary(categoryId);
}

export function findSymbolDefinition(type: string): SymbolDefinition | null {
  // Phase 7 — user-registered custom symbols. Synthesize a definition so the inspector renders binding
  // pickers for each declared slot and the canvas knows the default footprint.
  if (type.startsWith('custom:')) {
    const def = getCustomSymbol(type);
    if (!def) return null;
    return {
      type: `custom:${def.id}`,
      label: def.name,
      icon: '✳️',
      category: def.category || 'custom',
      defaultSize: def.defaultSize ?? { width: 120, height: 80 },
      bindingSlots: def.slots.map(s => s.name),
      isOpenBridge: false,
      description: 'Custom symbol',
    };
  }

  const cached = findCachedSymbol(type);
  if (cached) return cached;

  for (const cat of staticCategories) {
    const sym = cat.symbols.find(s => s.type === type);
    if (sym) return sym;
  }
  return null;
}

export async function findSymbolDefinitionAsync(type: string): Promise<SymbolDefinition | null> {
  const direct = findSymbolDefinition(type);
  if (direct) return direct;

  const catId = resolveCategoryId(type);
  if (!catId) return null;

  const cat = await loadCategoryLibrary(catId);
  return cat.symbols.find(s => s.type === type) ?? null;
}

export function getDefaultSizeSync(type: string): { width: number; height: number } {
  return findSymbolDefinition(type)?.defaultSize ?? { width: 100, height: 60 };
}
