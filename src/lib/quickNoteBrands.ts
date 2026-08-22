import { ICON_MAP, type IconName } from './icons';
import type { QuickNote, QuickNotesConfig } from './types';

export const QUICK_NOTE_BRANDS = [
  { name: 'brand:grab', slug: 'grab', label: 'Grab', color: '#00B14F', aliases: ['grab'] },
  {
    name: 'brand:chatgpt',
    slug: 'chatgpt',
    label: 'ChatGPT',
    color: '#111111',
    aliases: ['chatgpt', 'chat gpt', 'openai', 'open ai', 'codex'],
  },
  { name: 'brand:pea', slug: 'pea', label: 'PEA', color: '#6A2C91', aliases: ['pea'] },
  {
    name: 'brand:spotify',
    slug: 'spotify',
    label: 'Spotify',
    color: '#1ED760',
    aliases: ['spotify'],
  },
  {
    name: 'brand:7-eleven',
    slug: '7-eleven',
    label: '7-Eleven',
    color: '#008061',
    aliases: ['7 11', '7 eleven', '7eleven', 'seven eleven'],
  },
  { name: 'brand:bts', slug: 'bts', label: 'BTS', color: '#1C75BC', aliases: ['bts'] },
  {
    name: 'brand:m-flow',
    slug: 'm-flow',
    label: 'M-Flow',
    color: '#D5007F',
    aliases: ['m flow', 'mflow'],
  },
  { name: 'brand:ais', slug: 'ais', label: 'AIS', color: '#8DC63F', aliases: ['ais'] },
  { name: 'brand:ptt', slug: 'ptt', label: 'PTT', color: '#0054A6', aliases: ['ptt'] },
  {
    name: 'brand:tops',
    slug: 'tops',
    label: 'Tops',
    color: '#E31837',
    aliases: ['tops', 'tops daily', 'top at'],
  },
  {
    name: 'brand:lotus',
    slug: 'lotus',
    label: "Lotus's",
    color: '#009A44',
    aliases: ['lotus', 'lotuss', 'lotus express'],
  },
  {
    name: 'brand:big-c',
    slug: 'big-c',
    label: 'Big C',
    color: '#E31B23',
    aliases: ['big c', 'bigc', 'mini big c', 'mini bigc'],
  },
  {
    name: 'brand:shopee',
    slug: 'shopee',
    label: 'Shopee',
    color: '#EE4D2D',
    aliases: ['shopee', 'shoppee'],
  },
  {
    name: 'brand:promptpay',
    slug: 'promptpay',
    label: 'PromptPay',
    color: '#1A4F8B',
    aliases: ['promptpay', 'prompt pay'],
  },
  {
    name: 'brand:uob',
    slug: 'uob',
    label: 'UOB / PRIVI Miles',
    color: '#00377B',
    aliases: ['privimiles', 'privi miles', 'uob'],
  },
  {
    name: 'brand:apple-pay',
    slug: 'apple-pay',
    label: 'Apple Pay',
    color: '#000000',
    aliases: ['apple pay', 'applepay'],
  },
  {
    name: 'brand:icloud',
    slug: 'icloud',
    label: 'iCloud',
    color: '#3693F3',
    aliases: ['icloud', 'i cloud'],
  },
  { name: 'brand:apple', slug: 'apple', label: 'Apple', color: '#000000', aliases: ['apple'] },
  {
    name: 'brand:aws',
    slug: 'aws',
    label: 'AWS',
    color: '#232F3E',
    aliases: ['aws', 'amazon web services'],
  },
  { name: 'brand:figma', slug: 'figma', label: 'Figma', color: '#F24E1E', aliases: ['figma'] },
  { name: 'brand:steam', slug: 'steam', label: 'Steam', color: '#1B2838', aliases: ['steam'] },
  {
    name: 'brand:starbucks',
    slug: 'starbucks',
    label: 'Starbucks',
    color: '#006241',
    aliases: ['starbucks', 'starbuck'],
  },
  {
    name: 'brand:cafe-amazon',
    slug: 'cafe-amazon',
    label: 'Café Amazon',
    color: '#007A3D',
    aliases: ['cafe amazon', 'cafeamazon'],
  },
  { name: 'brand:jetts', slug: 'jetts', label: 'Jetts', color: '#E31837', aliases: ['jetts', 'jett'] },
  { name: 'brand:rbsc', slug: 'rbsc', label: 'RBSC', color: '#006B54', aliases: ['rbsc'] },
] as const;

export type QuickNoteBrand = (typeof QUICK_NOTE_BRANDS)[number];
export type QuickNoteBrandName = QuickNoteBrand['name'];
export type QuickNoteBrandSlug = QuickNoteBrand['slug'];

const QUICK_NOTE_BRAND_BY_NAME = new Map<QuickNoteBrandName, QuickNoteBrand>(
  QUICK_NOTE_BRANDS.map((brand) => [brand.name, brand] as const),
);
const STORED_ICON_MARKER = Symbol('quick-note-stored-icon');

type StoredIconState = {
  hasOwnIcon: boolean;
  icon: string | undefined;
};

type PresentationQuickNote = QuickNote & {
  [STORED_ICON_MARKER]?: StoredIconState;
};

function normalizeLabel(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/@/g, ' at ')
    .replace(/[^a-z0-9ก-๙]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function matchesAlias(label: string, alias: string): boolean {
  return label === alias || label.startsWith(`${alias} `);
}

export function isQuickNoteBrandName(
  value: string | undefined,
): value is QuickNoteBrandName {
  return value !== undefined && QUICK_NOTE_BRAND_BY_NAME.has(value as QuickNoteBrandName);
}

export function getQuickNoteBrand(
  value: string | undefined,
): QuickNoteBrand | undefined {
  return isQuickNoteBrandName(value)
    ? QUICK_NOTE_BRAND_BY_NAME.get(value)
    : undefined;
}

export function resolveQuickNoteBrandName(
  label: string,
): QuickNoteBrandName | undefined {
  const normalizedLabel = normalizeLabel(label);
  if (!normalizedLabel) return undefined;

  for (const brand of QUICK_NOTE_BRANDS) {
    if (brand.aliases.some((alias) => matchesAlias(normalizedLabel, alias))) {
      return brand.name;
    }
  }

  return undefined;
}

function isLucideIconName(value: string | undefined): value is IconName {
  return value !== undefined && Object.prototype.hasOwnProperty.call(ICON_MAP, value);
}

export function resolveQuickNoteIconName(
  icon: string | undefined,
  label: string,
  fallback = 'Tag',
): string {
  if (isQuickNoteBrandName(icon) || isLucideIconName(icon)) return icon;

  return resolveQuickNoteBrandName(label) ?? fallback;
}

export function resolveQuickNoteForPresentation(note: QuickNote): QuickNote {
  const icon = resolveQuickNoteIconName(note.icon, note.label);
  if (icon === note.icon) return note;

  const presentationNote: PresentationQuickNote = { ...note, icon };
  Object.defineProperty(presentationNote, STORED_ICON_MARKER, {
    value: {
      hasOwnIcon: Object.prototype.hasOwnProperty.call(note, 'icon'),
      icon: note.icon,
    } satisfies StoredIconState,
    enumerable: false,
  });
  return presentationNote;
}

export function prepareQuickNotesForPersistence(notes: QuickNote[]): QuickNote[] {
  return notes.map((note) => {
    if (!Object.prototype.hasOwnProperty.call(note, STORED_ICON_MARKER)) {
      return note;
    }

    const stored = (note as PresentationQuickNote)[STORED_ICON_MARKER];
    if (!stored) return note;

    const restored = { ...note } as Omit<QuickNote, 'icon'> & {
      icon?: string | undefined;
    };
    if (stored.hasOwnIcon) {
      restored.icon = stored.icon;
    } else {
      delete restored.icon;
    }
    return restored as QuickNote;
  });
}

export function prepareQuickNotesConfigForPersistence(
  config: QuickNotesConfig,
): QuickNotesConfig {
  return Object.fromEntries(
    Object.entries(config).map(([key, notes]) => [
      key,
      prepareQuickNotesForPersistence(notes),
    ]),
  );
}
