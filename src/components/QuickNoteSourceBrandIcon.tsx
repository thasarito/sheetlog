import { useState, type CSSProperties } from 'react';
import {
  getQuickNoteBrand,
  type QuickNoteBrandName,
  type QuickNoteBrandSlug,
} from '../lib/quickNoteBrands';
import { QuickNoteBrandIcon } from './QuickNoteBrandIcon';

type QuickNoteSourceBrand = {
  slug: QuickNoteBrandSlug;
  src: string;
  mode: 'image' | 'mask';
  scale: number;
  source: string;
  surface?: 'light';
};

export const QUICK_NOTE_SOURCE_BRANDS = {
  'brand:grab': {
    slug: 'grab',
    src: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/grab.svg',
    mode: 'mask',
    scale: 1,
    source: 'Simple Icons',
  },
  'brand:chatgpt': {
    slug: 'chatgpt',
    src: 'https://raw.githubusercontent.com/FortAwesome/Font-Awesome/7.x/svgs/brands/openai.svg',
    mode: 'mask',
    scale: 0.82,
    source: 'Font Awesome',
    surface: 'light',
  },
  'brand:pea': {
    slug: 'pea',
    src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Logo%20of%20the%20Provincial%20Electricity%20Authority%20of%20Thailand.svg',
    mode: 'image',
    scale: 0.94,
    source: 'Wikimedia Commons',
  },
  'brand:spotify': {
    slug: 'spotify',
    src: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/spotify.svg',
    mode: 'mask',
    scale: 0.96,
    source: 'Simple Icons',
  },
  'brand:7-eleven': {
    slug: '7-eleven',
    src: 'https://commons.wikimedia.org/wiki/Special:FilePath/7-Eleven%20logo%202021.svg',
    mode: 'image',
    scale: 0.92,
    source: 'Wikimedia Commons',
  },
  'brand:bts': {
    slug: 'bts',
    src: 'https://commons.wikimedia.org/wiki/Special:FilePath/BTS-Logo.svg',
    mode: 'image',
    scale: 0.9,
    source: 'Wikimedia Commons',
  },
  'brand:m-flow': {
    slug: 'm-flow',
    src: 'https://play-lh.googleusercontent.com/JjMG5w9edqeKFe3QXuKHbjqqr7jIKDwTnV2rVn_c2_JWZcVHpUx-Cm49znAXNl0xRSmwOvFR-zxpZ2VIVmFz=w240-h480',
    mode: 'image',
    scale: 1,
    source: 'Google Play',
  },
  'brand:ais': {
    slug: 'ais',
    src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Advanced%20Info%20Service%20logo.svg',
    mode: 'image',
    scale: 1,
    source: 'Wikimedia Commons',
  },
  'brand:ptt': {
    slug: 'ptt',
    src: 'https://commons.wikimedia.org/wiki/Special:FilePath/PTT%20Public%20Company%20logo.svg',
    mode: 'image',
    scale: 0.95,
    source: 'Wikimedia Commons',
  },
  'brand:tops': {
    slug: 'tops',
    src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Tops%20Logo.svg',
    mode: 'image',
    scale: 1,
    source: 'Wikimedia Commons',
  },
  'brand:lotus': {
    slug: 'lotus',
    src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Lotus%27s%20Logo.svg',
    mode: 'image',
    scale: 1,
    source: 'Wikimedia Commons',
  },
  'brand:big-c': {
    slug: 'big-c',
    src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Big%20C%20Logo.svg',
    mode: 'image',
    scale: 0.98,
    source: 'Wikimedia Commons',
  },
  'brand:shopee': {
    slug: 'shopee',
    src: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/shopee.svg',
    mode: 'mask',
    scale: 0.94,
    source: 'Simple Icons',
  },
  'brand:promptpay': {
    slug: 'promptpay',
    src: 'https://raw.githubusercontent.com/uunw/thai-qr-payment/2a2851e87160a752492786eb1b73e5c1c6785287/packages/assets/src/svg/PromptPay1.svg',
    mode: 'image',
    scale: 1.05,
    source: '@thai-qr-payment/assets',
    surface: 'light',
  },
  'brand:uob': {
    slug: 'uob',
    src: 'https://commons.wikimedia.org/wiki/Special:FilePath/UOB%20Logo.svg',
    mode: 'image',
    scale: 1,
    source: 'Wikimedia Commons',
  },
  'brand:apple-pay': {
    slug: 'apple-pay',
    src: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/applepay.svg',
    mode: 'mask',
    scale: 0.95,
    source: 'Simple Icons',
    surface: 'light',
  },
  'brand:icloud': {
    slug: 'icloud',
    src: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/icloud.svg',
    mode: 'mask',
    scale: 0.96,
    source: 'Simple Icons',
  },
  'brand:apple': {
    slug: 'apple',
    src: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/apple.svg',
    mode: 'mask',
    scale: 0.82,
    source: 'Simple Icons',
    surface: 'light',
  },
  'brand:aws': {
    slug: 'aws',
    src: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/amazonwebservices.svg',
    mode: 'mask',
    scale: 0.95,
    source: 'Simple Icons',
    surface: 'light',
  },
  'brand:figma': {
    slug: 'figma',
    src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Figma-logo.svg',
    mode: 'image',
    scale: 0.9,
    source: 'Wikimedia Commons',
  },
  'brand:steam': {
    slug: 'steam',
    src: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/steam.svg',
    mode: 'mask',
    scale: 0.9,
    source: 'Simple Icons',
    surface: 'light',
  },
  'brand:starbucks': {
    slug: 'starbucks',
    src: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/starbucks.svg',
    mode: 'mask',
    scale: 0.94,
    source: 'Simple Icons',
  },
  'brand:cafe-amazon': {
    slug: 'cafe-amazon',
    src: 'https://api.iconify.design/arcticons:cafe-amazon.svg?color=%23007A3D',
    mode: 'image',
    scale: 0.96,
    source: 'Iconify / Arcticons',
  },
  'brand:jetts': {
    slug: 'jetts',
    src: 'https://cdn.prod.website-files.com/62b906070134352e8b2adb52/635a0751c3f0264fe0d0f378_Group%2038531.svg',
    mode: 'image',
    scale: 1.08,
    source: 'Jetts',
  },
  'brand:rbsc': {
    slug: 'rbsc',
    src: 'https://play-lh.googleusercontent.com/_PBmDbgqHYti2BIY7R1_rI4-it6_asaHx59Suojy01DPYmX7UX3K8NfeWApsXau59QVnC-iCoLtaZQ1n1UcENg',
    mode: 'image',
    scale: 1.12,
    source: 'RBSC application icon',
  },
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

function maskStyle(
  source: string,
  color: string,
  scale: number,
): CSSProperties {
  return {
    backgroundColor: color,
    maskImage: `url("${source}")`,
    maskPosition: 'center',
    maskRepeat: 'no-repeat',
    maskSize: 'contain',
    transform: `scale(${scale})`,
    transformOrigin: 'center',
    WebkitMaskImage: `url("${source}")`,
    WebkitMaskPosition: 'center',
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
  };
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
  const brand = getQuickNoteBrand(name);
  const status = sourceState.name === name ? sourceState.status : 'loading';
  const wrapperClassName = [
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const sourceLoaded = status === 'loaded';

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
      data-quick-note-brand-source="source"
      data-source-kind={asset.mode}
      data-source-provider={asset.source}
      data-source-status={status}
    >
      {!sourceLoaded ? (
        <QuickNoteBrandIcon name={name} className="h-full w-full" />
      ) : null}

      {sourceLoaded && asset.mode === 'mask' ? (
        <span
          className="absolute inset-0 block h-full w-full"
          data-source-render="mask"
          style={maskStyle(asset.src, brand?.color ?? '#111111', asset.scale)}
        />
      ) : null}

      {status !== 'failed' ? (
        <img
          src={asset.src}
          alt=""
          draggable={false}
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 block h-full w-full"
          style={{
            objectFit: 'contain',
            opacity: sourceLoaded && asset.mode === 'image' ? 1 : 0,
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
