import {
  DEFAULT_ACCOUNT_COLOR,
  DEFAULT_ACCOUNT_ICON,
  DEFAULT_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
  SUGGESTED_CATEGORY_COLORS,
  SUGGESTED_CATEGORY_ICONS,
} from './icons';
import type {
  AccountItem,
  CategoryConfigWithMeta,
  CategoryItem,
  TransactionType,
} from './types';

export class SettingsSectionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsSectionValidationError';
  }
}

interface AccountNormalizationOptions {
  itemLabel?: (index: number) => string;
}

interface CategoryNormalizationOptions {
  itemLabel?: (type: TransactionType, index: number) => string;
}

function invalid(message: string): never {
  throw new SettingsSectionValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredName(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    return invalid(`${label}: Name is required.`);
  }
  const name = value.trim();
  return name || invalid(`${label}: Name is required.`);
}

function optionalString(
  value: unknown,
  label: string,
  field: 'Icon' | 'Color',
): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') {
    return invalid(`${label}: ${field} must be a string.`);
  }
  return value.trim();
}

export function normalizeAccounts(
  value: unknown,
  options: AccountNormalizationOptions = {},
): AccountItem[] {
  if (!Array.isArray(value)) return invalid('Accounts must be an array.');
  const seen = new Set<string>();
  return value.map((item, index) => {
    const label = options.itemLabel?.(index) ?? `Account ${index + 1}`;
    if (!isRecord(item)) return invalid(`${label}: must be an object.`);
    const name = requiredName(item.name, label);
    const duplicateKey = name.toLowerCase();
    if (seen.has(duplicateKey)) {
      return invalid(`${label}: Duplicate name "${name}".`);
    }
    seen.add(duplicateKey);
    return {
      name,
      icon: optionalString(item.icon, label, 'Icon') || DEFAULT_ACCOUNT_ICON,
      color: optionalString(item.color, label, 'Color') || DEFAULT_ACCOUNT_COLOR,
    };
  });
}

export function normalizeCategories(
  value: unknown,
  options: CategoryNormalizationOptions = {},
): CategoryConfigWithMeta {
  if (!isRecord(value)) return invalid('Categories must be a section object.');
  const normalized = {} as CategoryConfigWithMeta;
  for (const type of ['expense', 'income', 'transfer'] as const) {
    const items = value[type];
    if (!Array.isArray(items)) {
      return invalid(`Categories ${type} must be an array.`);
    }
    const seen = new Set<string>();
    normalized[type] = items.map((item, index) => {
      const label = options.itemLabel?.(type, index) ?? `${type} Category ${index + 1}`;
      if (!isRecord(item)) return invalid(`${label}: must be an object.`);
      const name = requiredName(item.name, label);
      const duplicateKey = name.toLowerCase();
      if (seen.has(duplicateKey)) {
        return invalid(`${label}: Duplicate ${type} name "${name}".`);
      }
      seen.add(duplicateKey);
      const icon = optionalString(item.icon, label, 'Icon');
      const color = optionalString(item.color, label, 'Color');
      return {
        name,
        icon: icon || SUGGESTED_CATEGORY_ICONS[name] || DEFAULT_CATEGORY_ICONS[type],
        color: color || SUGGESTED_CATEGORY_COLORS[name] || DEFAULT_CATEGORY_COLORS[type],
      } satisfies CategoryItem;
    });
  }
  return normalized;
}
