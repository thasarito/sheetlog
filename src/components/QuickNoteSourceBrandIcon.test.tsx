import { readFileSync } from 'node:fs';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QUICK_NOTE_BRANDS } from '../lib/quickNoteBrands';
import { DynamicIcon } from './DynamicIcon';
import {
  getQuickNoteSourceBrandUrl,
  QUICK_NOTE_SOURCE_BRANDS,
} from './QuickNoteSourceBrandIcon';

function readVendoredAsset(file: string): string {
  return readFileSync(
    new URL(`../../public/quick-note-brands/${file}`, import.meta.url),
    'utf8',
  );
}

describe('Quick Note vendored brand icons', () => {
  it('maps every curated brand to a repository-local asset', () => {
    expect(Object.keys(QUICK_NOTE_SOURCE_BRANDS)).toEqual(
      QUICK_NOTE_BRANDS.map((brand) => brand.name),
    );

    for (const brand of QUICK_NOTE_BRANDS) {
      const asset = QUICK_NOTE_SOURCE_BRANDS[brand.name];
      const url = getQuickNoteSourceBrandUrl(brand.name);

      expect(asset.file).toBe(`${brand.slug}.svg`);
      expect(url).toMatch(/quick-note-brands\/.+\.svg$/);
      expect(url).not.toMatch(/^https?:\/\//);
      expect(asset.scale).toBeGreaterThan(0);
      expect(asset.scale).toBeLessThanOrEqual(1);
    }
  });

  it('vendors source-derived artwork instead of compact fallback copies', () => {
    const bts = readVendoredAsset('bts.svg');
    const mFlow = readVendoredAsset('m-flow.svg');
    const grab = readVendoredAsset('grab.svg');
    const ais = readVendoredAsset('ais.svg');
    const ptt = readVendoredAsset('ptt.svg');
    const uob = readVendoredAsset('uob.svg');
    const applePay = readVendoredAsset('apple-pay.svg');
    const promptPay = readVendoredAsset('promptpay.svg');
    const aws = readVendoredAsset('aws.svg');
    const figma = readVendoredAsset('figma.svg');

    expect(bts).toContain('#005b96');
    expect(bts).toContain('#c81518');
    expect(bts).not.toContain('<circle');

    expect(mFlow).toContain('#003b7a');
    expect(mFlow).toContain('#f0442e');
    expect(mFlow).not.toContain('#D5007F');

    expect(grab).toContain('#00b14f');
    expect(grab).toContain('fill="#fff"');
    expect(grab).toContain('<rect');

    expect(ais).toContain('#a6a8aa');
    expect(ais).toContain('#333991');
    expect(ais).not.toContain('<text');

    expect(ptt).toContain('#00aeef');
    expect(ptt).toContain('#1b1464');
    expect(ptt).toContain('#ed1d24');

    expect(uob).toContain('#e1091d');
    expect(uob).toContain('#002469');
    expect(uob).not.toContain('<text');

    expect(applePay).toContain('M2.15 4.318');
    expect(applePay).not.toContain('<text');

    expect(promptPay).toContain('#00A796');
    expect(promptPay).toContain('M127 75');
    expect(promptPay).not.toContain('<circle');

    expect(aws).toContain('M180.4 203');
    expect(aws).not.toContain('<text');

    expect(figma).toContain('M64 384');
    expect(figma).toContain('#1ABCFE');
    expect(figma).not.toContain('<circle');
  });

  it('renders a local asset after it loads', () => {
    const { container } = render(
      <DynamicIcon name="brand:grab" className="h-6 w-6" />,
    );
    const wrapper = container.querySelector(
      '[data-quick-note-brand="grab"]',
    );
    const image = wrapper?.querySelector('img');

    expect(wrapper).toHaveAttribute('data-quick-note-brand-source', 'vendored');
    expect(wrapper).toHaveAttribute('data-source-status', 'loading');
    expect(wrapper?.querySelector('svg')).toBeInTheDocument();
    expect(image?.getAttribute('src')).toMatch(
      /quick-note-brands\/grab\.svg$/,
    );

    if (!image) throw new Error('Expected vendored brand image');
    fireEvent.load(image);

    expect(wrapper).toHaveAttribute('data-source-status', 'loaded');
    expect(wrapper?.querySelector('svg')).not.toBeInTheDocument();
    expect(image).toHaveStyle({
      objectFit: 'contain',
      opacity: '1',
      transform: 'scale(1)',
    });
  });

  it('keeps the compact fallback when a local asset cannot load', () => {
    const { container } = render(
      <DynamicIcon name="brand:jetts" className="h-6 w-6" />,
    );
    const wrapper = container.querySelector(
      '[data-quick-note-brand="jetts"]',
    );
    const image = wrapper?.querySelector('img');

    if (!image) throw new Error('Expected vendored brand image');
    fireEvent.error(image);

    expect(wrapper).toHaveAttribute('data-source-status', 'failed');
    expect(wrapper?.querySelector('img')).not.toBeInTheDocument();
    expect(wrapper?.querySelector('svg')).toBeInTheDocument();
  });
});
