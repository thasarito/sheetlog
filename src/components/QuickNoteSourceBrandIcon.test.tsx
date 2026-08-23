import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DynamicIcon } from './DynamicIcon';

const JETTS_SOURCE =
  'https://cdn.prod.website-files.com/62b906070134352e8b2adb52/635a0751c3f0264fe0d0f378_Group%2038531.svg';
const RBSC_SOURCE =
  'https://play-lh.googleusercontent.com/_PBmDbgqHYti2BIY7R1_rI4-it6_asaHx59Suojy01DPYmX7UX3K8NfeWApsXau59QVnC-iCoLtaZQ1n1UcENg';

describe('Quick Note source brand icons', () => {
  it.each([
    ['brand:jetts', 'jetts', JETTS_SOURCE, 'scale(1.08)'],
    ['brand:rbsc', 'rbsc', RBSC_SOURCE, 'scale(1.12)'],
  ])(
    'renders %s from its supplied source asset with normalized sizing',
    (name, slug, source, transform) => {
      const { container } = render(
        <DynamicIcon name={name} className="h-6 w-6" />,
      );

      const wrapper = container.querySelector(
        `[data-quick-note-brand="${slug}"]`,
      );
      const image = wrapper?.querySelector('img');

      expect(wrapper).toHaveAttribute('data-quick-note-brand-source', 'source');
      expect(image).toHaveAttribute('src', source);
      expect(image).toHaveStyle({
        objectFit: 'contain',
        transform,
      });
    },
  );
});
