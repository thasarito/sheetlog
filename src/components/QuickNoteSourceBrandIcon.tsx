import { useState, type CSSProperties } from 'react';
import type {
  QuickNoteBrandName,
  QuickNoteBrandSlug,
} from '../lib/quickNoteBrands';
import { QuickNoteBrandIcon } from './QuickNoteBrandIcon';

type QuickNoteSourceBrand = {
  slug: QuickNoteBrandSlug;
  file: string;
  scale: number;
  surface?: 'light';
};

const QUICK_NOTE_ASSET_BASE = `${import.meta.env.BASE_URL}quick-note-brands/`;

export const QUICK_NOTE_SOURCE_BRANDS = {
  'brand:grab': {
    slug: 'grab',
    file: 'grab.svg',
    scale: 1.0,
  },
  'brand:chatgpt': {
    slug: 'chatgpt',
    file: 'chatgpt.svg',
    scale: 0.88,
    surface: 'light',
  },
  'brand:pea': {
    slug: 'pea',
    file: 'pea.svg',
    scale: 0.94,
  },
  'brand:spotify': {
    slug: 'spotify',
    file: 'spotify.svg',
    scale: 0.96,
  },
  'brand:7-eleven': {
    slug: '7-eleven',
    file: '7-eleven.svg',
    scale: 0.92,
  },
  'brand:bts': {
    slug: 'bts',
    file: 'bts.svg',
    scale: 0.9,
  },
  'brand:m-flow': {
    slug: 'm-flow',
    file: 'm-flow.svg',
    scale: 1.0,
  },
  'brand:ais': {
    slug: 'ais',
    file: 'ais.svg',
    scale: 1.0,
  },
  'brand:ptt': {
    slug: 'ptt',
    file: 'ptt.svg',
    scale: 0.95,
  },
  'brand:tops': {
    slug: 'tops',
    file: 'tops.svg',
    scale: 1.0,
  },
  'brand:lotus': {
    slug: 'lotus',
    file: 'lotus.svg',
    scale: 1.0,
  },
  'brand:big-c': {
    slug: 'big-c',
    file: 'big-c.svg',
    scale: 0.98,
  },
  'brand:shopee': {
    slug: 'shopee',
    file: 'shopee.svg',
    scale: 0.94,
  },
  'brand:promptpay': {
    slug: 'promptpay',
    file: 'promptpay.svg',
    scale: 1.0,
  },
  'brand:uob': {
    slug: 'uob',
    file: 'uob.svg',
    scale: 1.0,
  },
  'brand:apple-pay': {
    slug: 'apple-pay',
    file: 'apple-pay.svg',
    scale: 0.95,
    surface: 'light',
  },
  'brand:icloud': {
    slug: 'icloud',
    file: 'icloud.svg',
    scale: 0.96,
  },
  'brand:apple': {
    slug: 'apple',
    file: 'apple.svg',
    scale: 0.86,
    surface: 'light',
  },
  'brand:aws': {
    slug: 'aws',
    file: 'aws.svg',
    scale: 0.95,
    surface: 'light',
  },
  'brand:figma': {
    slug: 'figma',
    file: 'figma.svg',
    scale: 0.9,
  },
  'brand:steam': {
    slug: 'steam',
    file: 'steam.svg',
    scale: 0.9,
    surface: 'light',
  },
  'brand:starbucks': {
    slug: 'starbucks',
    file: 'starbucks.svg',
    scale: 0.94,
  },
  'brand:cafe-amazon': {
    slug: 'cafe-amazon',
    file: 'cafe-amazon.svg',
    scale: 0.96,
  },
  'brand:jetts': {
    slug: 'jetts',
    file: 'jetts.svg',
    scale: 1.0,
  },
  'brand:rbsc': {
    slug: 'rbsc',
    file: 'rbsc.svg',
    scale: 1.0,
  }
} as const satisfies Record<QuickNoteBrandName, QuickNoteSourceBrand>;

export type QuickNoteSourceBrandName = keyof typeof QUICK_NOTE_SOURCE_BRANDS;
type SourceStatus = 'loading' | 'loaded' | 'failed';

type QuickNoteSourceBrandIconProps = {
  name: string | undefined;
  className?: string;
  style?: CSSProperties;
};

export function isQuickNoteSourceBrandName(
  value: string | undefined,
): value is QuickNoteSourceBrandName {
  return (
    value !== undefined &&
    Object.prototype.hasOwnProperty.call(QUICK_NOTE_SOURCE_BRANDS, value)
  );
}

export function getQuickNoteSourceBrandUrl(
  name: QuickNoteSourceBrandName,
): string {
  return `${QUICK_NOTE_ASSET_BASE}${QUICK_NOTE_SOURCE_BRANDS[name].file}`;
}

export function QuickNoteSourceBrandIcon({
  name,
  className,
  style,
}: QuickNoteSourceBrandIconProps) {
  const [sourceState, setSourceState] = useState<{
    name: string | undefined;
    status: SourceStatus;
  }>({ name, status: 'loading' });

  if (!isQuickNoteSourceBrandName(name)) {
    return (
      <QuickNoteBrandIcon name={name} className={className} style={style} />
    );
  }

  const asset = QUICK_NOTE_SOURCE_BRANDS[name];
  const status = sourceState.name === name ? sourceState.status : 'loading';
  const sourceLoaded = status === 'loaded';
  const wrapperClassName = [
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      aria-hidden="true"
      className={wrapperClassName}
      style={{
        ...style,
        backgroundColor: asset.surface === 'light' ? '#FFFFFF' : undefined,
        borderRadius: asset.surface === 'light' ? '22%' : undefined,
        lineHeight: 0,
        padding: asset.surface === 'light' ? '8%' : undefined,
      }}
      data-quick-note-brand={asset.slug}
      data-quick-note-brand-source="vendored"
      data-source-status={status}
    >
      {!sourceLoaded ? (
        <QuickNoteBrandIcon name={name} className="h-full w-full" />
      ) : null}

      {status !== 'failed' ? (
        <img
          src={getQuickNoteSourceBrandUrl(name)}
          alt=""
          draggable={false}
          decoding="async"
          className="absolute inset-0 block h-full w-full"
          style={{
            objectFit: 'contain',
            opacity: sourceLoaded ? 1 : 0,
            transform: `scale(${asset.scale})`,
            transformOrigin: 'center',
          }}
          onLoad={() => setSourceState({ name, status: 'loaded' })}
          onError={() => setSourceState({ name, status: 'failed' })}
        />
      ) : null}
    </span>
  );
}
