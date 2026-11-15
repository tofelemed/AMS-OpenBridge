/**
 * CHG-193 (owner decision 15 Nov 2026): Secondary buttons take the regular weight while Primary keeps semibold. OpenBridge
 * reads one weight variable (`--global-typography-ui-button-font-weight`) for every variant and keeps the variant as a class
 * inside the shadow root, so a page stylesheet cannot tell a raised host from a normal one. The React wrapper sets `variant`
 * as a property, never an attribute. This marks the `variant` property as reflected, so every host carries
 * `variant="raised|normal|flat"` and styles/button-standard.css can scope the weight to normal and flat.
 *
 * Lit keeps the property's options object and reads `reflect` from it on each change (ReactiveElement.requestUpdate), so
 * the flag is set on that object, before any button renders (imported first in main.tsx). obcButtonVariant.test.ts proves
 * the attribute on the real element; if an OpenBridge upgrade changes this, that test fails and the weight falls back to
 * semibold for every variant (the earlier look), nothing breaks.
 */
import { ObcButton } from '@oicl/openbridge-webcomponents/dist/components/button/button.js';

type Reflectable = { reflect?: boolean };
const options = (ObcButton as unknown as { elementProperties?: Map<PropertyKey, Reflectable> }).elementProperties?.get('variant');
if (options) options.reflect = true;
