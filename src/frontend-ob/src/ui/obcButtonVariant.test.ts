// CHG-193 (owner decision 15 Nov 2026, A1): Secondary buttons take the regular weight and Primary keeps semibold. OpenBridge has
// one weight variable for every variant, so the host must say its variant: obcButtonVariant.ts reflects `variant` to an attribute,
// which styles/button-standard.css reads.
import { afterEach, describe, expect, it } from 'vitest';
import './obcButtonVariant';
import type { ObcButton } from '@oicl/openbridge-webcomponents/dist/components/button/button.js';

afterEach(() => { document.body.innerHTML = ''; });

const mount = async (variant?: string) => {
  const el = document.createElement('obc-button') as ObcButton;
  if (variant) el.variant = variant as ObcButton['variant'];
  el.textContent = 'Label';
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

describe('obc-button variant attribute', () => {
  it('reflects the variant a page sets as a property (the React wrapper sets properties)', async () => {
    expect((await mount('raised')).getAttribute('variant')).toBe('raised');
    expect((await mount('flat')).getAttribute('variant')).toBe('flat');
  });

  it('reflects the default variant, normal', async () => {
    expect((await mount()).getAttribute('variant')).toBe('normal');
  });

  it('follows a change of variant (a toggle that turns primary)', async () => {
    const el = await mount('normal');
    el.variant = 'raised' as ObcButton['variant'];
    await el.updateComplete;
    expect(el.getAttribute('variant')).toBe('raised');
  });
});
