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
    const pea = readVendoredAsset('pea.svg');
    const sevenEleven = readVendoredAsset('7-eleven.svg');
    const ais = readVendoredAsset('ais.svg');
    const ptt = readVendoredAsset('ptt.svg');
    const tops = readVendoredAsset('tops.svg');
    const lotus = readVendoredAsset('lotus.svg');
    const bigC = readVendoredAsset('big-c.svg');
    const uob = readVendoredAsset('uob.svg');
    const applePay = readVendoredAsset('apple-pay.svg');
    const promptPay = readVendoredAsset('promptpay.svg');
    const aws = readVendoredAsset('aws.svg');
    const figma = readVendoredAsset('figma.svg');
    const starbucks = readVendoredAsset('starbucks.svg');
    const cafeAmazon = readVendoredAsset('cafe-amazon.svg');
    const jetts = readVendoredAsset('jetts.svg');
    const rbsc = readVendoredAsset('rbsc.svg');

    expect(bts).toContain('#005b96');
    expect(bts).toContain('#c81518');
    expect(bts).not.toContain('<circle');

    expect(mFlow).toContain('#003b7a');
    expect(mFlow).toContain('#f0442e');
    expect(mFlow).not.toContain('#D5007F');

    expect(grab).toContain('#00b14f');
    expect(grab).toContain('fill="#fff"');
    expect(grab).toContain('<rect');

    expect(pea).toContain('#6a2c91');
    expect(pea).toContain('#b58e00');
    expect(pea).not.toContain('>PEA<');

    expect(sevenEleven).toContain('#577884');
    expect(sevenEleven).toContain('#bb3c44');
    expect(sevenEleven).toContain('#d6983b');
    expect(sevenEleven).not.toContain('<text');

    expect(ais).toContain('#a6a8aa');
    expect(ais).toContain('#333991');
    expect(ais).not.toContain('<text');

    expect(ptt).toContain('#00aeef');
    expect(ptt).toContain('#1b1464');
    expect(ptt).toContain('#ed1d24');

    expect(tops).toContain('#ff3b20');
    expect(tops).not.toContain('>t<');

    expect(lotus).toContain('#00b9b5');
    expect(lotus).toContain('#ffd200');
    expect(lotus).not.toContain('>L<');

    expect(bigC).toContain('#8bd600');
    expect(bigC).toContain('#ed1b2e');
    expect(bigC).not.toContain('>C<');

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

    expect(starbucks).toContain('M9 10.15');
    expect(starbucks).not.toContain('m12 6.5 1.4 3');

    expect(cafeAmazon).toContain('#092f1f');
    expect(cafeAmazon).toContain('#f7b719');
    expect(cafeAmazon).not.toContain('M6 16 12 5');

    expect(jetts).toContain('24 hour fitness');
    expect(jetts).not.toContain('>J<');

    expect(rbsc).toContain('#214f9a');
    expect(rbsc).toContain('#d8ad16');
    expect(rbsc).not.toContain('>RBSC<');
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
