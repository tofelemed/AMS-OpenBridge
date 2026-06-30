// HMI Designer Components
// Import the CSS
import './Designer.css';

// Export components
export { DisplayDesigner } from './DisplayDesigner';
export { DesignerPage } from './DesignerPage';
export { DisplayList } from './DisplayList';
export { DesignerCanvas } from './DesignerCanvas';
export { SymbolPalette, SYMBOL_LIBRARY } from './SymbolPalette';
export { SymbolRenderer } from './SymbolRenderer';
export { PropertyInspector } from './PropertyInspector';
export { AssetBrowser, TagPicker } from './AssetBrowser';

// Export types
export type {
  CanvasItem,
  FormattingOptions,
  AlarmLimits,
  ItemStyle,
  ShapeProps,
  TextProps,
  Asset,
  SymbolDefinition,
  SymbolCategory,
} from './types';

export { ASSET_TYPES, ASSET_TYPE_LABELS, ASSET_TYPE_ICONS } from './types';
