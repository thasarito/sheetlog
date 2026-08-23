import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QUICK_NOTE_BRANDS } from '../lib/quickNoteBrands';
import { DynamicIcon } from './DynamicIcon';
import { QUICK_NOTE_SOURCE_BRANDS } from './QuickNoteSourceBrandIcon';

const JETTS_SOURCE =
  'https://cdn.prod.website-files.com/62b906070134352e8b2adb52/635a0751c3f0264fe0d0f378_Group%2038531.svg';
const RBSC_SOURCE =
  'https://play-lh.googleusercontent.com/_PBmDbgqHYti2BIY7R1_rI4-it6_asaHx59Suojy01DPYmX7UX3K8NfeWApsXau59QVnC-iCoLtaZQ1n1UcENg';

describe('Quick Note source brand icons', () => {
  it('provides a source asset for every curated Quick Note brand', () => {
    expect(Object.keys(QUICK_NOTE_SOURCE_BRANDS)).toEqual(
      QUICK_NOTE_BRANDS.map((brand) => brand.name),
    );

    for (const asset of Object.values(QUICK_NOTE_SOURCE_BRANDS)) {
      expect(asset.src).toMatch(/^https:\/\//);
      expect(asset.scale).toBeGreaterThan(0);
      expect(asset.scale).toBeLessThanOrEqual(1.12);
    }
  });

  it('renders a full-colour source image after it loads', () => {
    const asset = QUICK_NOTE_SOURCE_BRANDS['brand:pea'];
    const { container } = render(
      <DynamicIcon name="brand:pea" className="h-6 w-6" />,
    );
    const wrapper = container.querySelector(
      '[data-quick-note-brand="pea"]',
    );
    const image = wrapper?.querySelector('img');

    expect(wrapper).toHaveAttribute('data-source-kind', 'image');
    expect(wrapper).toHaveAttribute('data-source-status', 'loading');
    expect(wrapper?.querySelector('svg')).toBeInTheDocument();
    expect(image).toHaveAttribute('src', asset.src);

    if (!image) throw new Error('Expected source image');
    fireEvent.load(image);

    expect(wrapper).toHaveAttribute('data-source-status', 'loaded');
    expect(wrapper?.querySelector('svg')).not.toBeInTheDocument();
    expect(image).toHaveStyle({
      objectFit: 'contain',
      opacity: '1',
      transform: `scale(${asset.scale})`,
    });
  });

  it('uses the downloaded SVG geometry as an official-colour mask', () => {
    const asset = QUICK_NOTE_SOURCE_BRANDS['brand:grab'];
    const { container } = render(
      <DynamicIcon name="brand:grab" className="h-6 w-6" />,
    );
    const wrapper = container.querySelector(
      '[data-quick-note-brand="grab"]',
    );
    const image = wrapper?.querySelector('img');

    expect(wrapper).toHaveAttribute('data-source-kind', 'mask');
    if (!image) throw new Error('Expected source probe image');
    fireEvent.load(image);

    const mask = wrapper?.querySelector('[data-source-render="mask"]');
    expect(wrapper).toHaveAttribute('data-source-status', 'loaded');
    expect(mask).toHaveStyle({
      backgroundColor: '#00B14F',
      maskSize: 'contain',
      transform: `scale(${asset.scale})`,
    });
    expect(mask?.getAttribute('style')).toContain(asset.src);
  });

  it.each([
    ['brand:jetts', JETTS_SOURCE, 'scale(1.08)'],
    ['brand:rbsc', RBSC_SOURCE, 'scale(1.12)'],
  ])('keeps the supplied %s source and normalized size', (name, source, transform) => {
    const { container } = render(
      <DynamicIcon name={name} className="h-6 w-6" />,
    );
    const image = container.querySelector('img');

    expect(image).toHaveAttribute('src', source);
    expect(image).toHaveStyle({ transform });
  });

  it('keeps the bundled compact mark when a source asset cannot load', () => {
    const { container } = render(
      <DynamicIcon name="brand:jetts" className="h-6 w-6" />,
    );
    const wrapper = container.querySelector(
      '[data-quick-note-brand="jetts"]',
    );
    const image = wrapper?.querySelector('img');

    if (!image) throw new Error('Expected supplied source image');
    fireEvent.error(image);

    expect(wrapper).toHaveAttribute('data-source-status', 'failed');
    expect(wrapper?.querySelector('img')).not.toBeInTheDocument();
    expect(wrapper?.querySelector('svg')).toBeInTheDocument();
  });
});
