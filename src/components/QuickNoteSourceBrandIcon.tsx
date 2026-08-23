import { useState, type CSSProperties } from 'react';
import { QuickNoteBrandIcon } from './QuickNoteBrandIcon';

const QUICK_NOTE_SOURCE_BRANDS = {
  'brand:jetts': {
    slug: 'jetts',
    src: 'https://cdn.prod.website-files.com/62b906070134352e8b2adb52/635a0751c3f0264fe0d0f378_Group%2038531.svg',
    scale: 1.08,
  },
  'brand:rbsc': {
    slug: 'rbsc',
    src: 'https://play-lh.googleusercontent.com/_PBmDbgqHYti2BIY7R1_rI4-it6_asaHx59Suojy01DPYmX7UX3K8NfeWApsXau59QVnC-iCoLtaZQ1n1UcENg',
    scale: 1.12,
  },
} as const;

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
      style={{ ...style, lineHeight: 0 }}
      data-quick-note-brand={asset.slug}
      data-quick-note-brand-source="source"
      data-source-status={status}
    >
      {status !== 'loaded' ? (
        <QuickNoteBrandIcon
          name={name}
          className="h-full w-full"
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
            opacity: status === 'loaded' ? 1 : 0,
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
