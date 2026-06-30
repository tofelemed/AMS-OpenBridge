/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPC_SERVER_ID: string;
  readonly VITE_SIGNALR_HUB_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '@oicl/openbridge-webcomponents-react/components/top-bar/top-bar' {
  import { FC, ReactNode } from 'react';
  export interface ObcTopBarProps {
    appTitle?: string;
    pageTitle?: string;
    showDivider?: boolean;
    children?: ReactNode;
  }
  export const ObcTopBar: FC<ObcTopBarProps>;
}

declare module '@oicl/openbridge-webcomponents-react/components/alert-button/alert-button' {
  import { FC } from 'react';
  export interface ObcAlertButtonProps {
    'alert-type'?: 'alarm' | 'warning' | 'caution' | 'running' | 'notice' | 'command';
    count?: number;
    acknowledged?: boolean;
    muted?: boolean;
    onClick?: () => void;
  }
  export const ObcAlertButton: FC<ObcAlertButtonProps>;
}

declare module '@oicl/openbridge-webcomponents-react/components/button/button' {
  import { FC, ReactNode } from 'react';
  export interface ObcButtonProps {
    variant?: 'flat' | 'normal' | 'raised' | 'amplified';
    size?: 'small' | 'regular' | 'large';
    disabled?: boolean;
    onClick?: () => void;
    children?: ReactNode;
  }
  export const ObcButton: FC<ObcButtonProps>;
}

declare module '@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator' {
  import { FC, ReactNode } from 'react';
  export interface ObcStatusIndicatorProps {
    status?: 'active' | 'inactive' | 'caution' | 'warning' | 'alarm' | 'running';
    children?: ReactNode;
  }
  export const ObcStatusIndicator: FC<ObcStatusIndicatorProps>;
}

declare module '@oicl/openbridge-webcomponents-react/components/progress-bar/progress-bar' {
  import { FC, CSSProperties } from 'react';
  export interface ObcProgressBarProps {
    value?: number;
    max?: number;
    style?: CSSProperties;
  }
  export const ObcProgressBar: FC<ObcProgressBarProps>;
}

declare module '@oicl/openbridge-webcomponents-react/components/slider/slider' {
  import { FC } from 'react';
  export interface ObcSliderProps {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    onValue?: (value: number) => void;
  }
  export const ObcSlider: FC<ObcSliderProps>;
}

declare module '@oicl/openbridge-webcomponents-react/components/toggle-switch/toggle-switch' {
  import { FC } from 'react';
  export interface ObcToggleSwitchProps {
    checked?: boolean;
    disabled?: boolean;
    onChange?: (checked: boolean) => void;
  }
  export const ObcToggleSwitch: FC<ObcToggleSwitchProps>;
}

declare module '@oicl/openbridge-webcomponents-react/components/badge/badge' {
  import { FC, ReactNode } from 'react';
  export interface ObcBadgeProps {
    variant?: 'default' | 'success' | 'warning' | 'error';
    children?: ReactNode;
  }
  export const ObcBadge: FC<ObcBadgeProps>;
}

declare module '@oicl/openbridge-webcomponents-react/components/card/card' {
  import { FC, ReactNode } from 'react';
  export interface ObcCardProps {
    children?: ReactNode;
  }
  export const ObcCard: FC<ObcCardProps>;
}

declare module '@oicl/openbridge-webcomponents-react/components/clock/clock' {
  import { FC } from 'react';
  export interface ObcClockProps {
    format?: '12h' | '24h';
    showSeconds?: boolean;
  }
  export const ObcClock: FC<ObcClockProps>;
}

declare module '@oicl/openbridge-webcomponents-react/components/breadcrumb/breadcrumb' {
  import { FC } from 'react';
  export interface BreadcrumbItem {
    label: string;
    href?: string;
  }
  export interface ObcBreadcrumbProps {
    items?: BreadcrumbItem[];
  }
  export const ObcBreadcrumb: FC<ObcBreadcrumbProps>;
}

declare module '@oicl/openbridge-webcomponents-react/components/alert-icon/alert-icon' {
  import { FC } from 'react';
  export interface ObcAlertIconProps {
    'alert-type'?: 'alarm' | 'warning' | 'caution' | 'notice';
  }
  export const ObcAlertIcon: FC<ObcAlertIconProps>;
}
