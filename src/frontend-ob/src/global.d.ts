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
