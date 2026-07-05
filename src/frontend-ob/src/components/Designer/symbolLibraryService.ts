import type { SymbolCategory, SymbolDefinition } from './types';
import {
  LAZY_CATEGORY_META,
  loadCategoryLibrary,
  findCachedSymbol,
  resolveCategoryId,
  type LazyCategoryId,
} from './lazyCategoryRegistry';

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
