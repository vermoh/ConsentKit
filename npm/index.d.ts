/**
 * ConsentKit — type declarations for the public API, config and React hook.
 *
 * Deliberately dependency-free: nothing is imported from 'react', so these
 * types check with a bare `tsc --noEmit` and no @types packages installed.
 */

/** Consent category. `necessary` is always granted and cannot be switched off. */
export type CkCategory = 'necessary' | 'functional' | 'analytics' | 'marketing';

/** Opt-in categories — everything except `necessary`. */
export type CkOptInCategory = 'functional' | 'analytics' | 'marketing';

/** Per-category grant map. */
export interface CkCategories {
  /** Always `true`. */
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

/** How the current decision was made. `null` while undecided. */
export type CkMethod = 'accept_all' | 'reject_all' | 'custom' | null;

/** Public consent state, as returned by `getState()`. */
export interface CkState {
  /** `false` until the visitor makes a choice — the banner shows while false. */
  decided: boolean;
  /** UUID of the stored decision, `null` while undecided. */
  id: string | null;
  /** ISO timestamp of the decision, `null` while undecided. */
  ts: string | null;
  /** Policy version the decision was recorded against. */
  policyVersion: string;
  categories: CkCategories;
  method: CkMethod;
}

/** Argument to `accept()`: `'all'`, or an explicit per-category selection. */
export type CkAcceptArg = 'all' | Partial<Record<CkOptInCategory, boolean>>;

/** Banner placement. `bar` uses bottom/top; `box` uses the corner positions. */
export type CkLayoutType = 'bar' | 'modal' | 'box';

export type CkLayoutPosition = 'bottom' | 'top' | 'bottom-right' | 'bottom-left';

export interface CkLayoutConfig {
  /** Default `'bar'`. Unknown combinations degrade to `bar` / `bottom`. */
  type?: CkLayoutType;
  /** `bar`: `'bottom' | 'top'`. `box`: `'bottom-right' | 'bottom-left'`. */
  position?: CkLayoutPosition;
}

/** Optional override for the dark palette (v0.2). */
export interface CkDarkTheme {
  bg?: string;
  ink?: string;
  accent?: string;
}

export interface CkThemeConfig {
  /** Accent colour, exposed as `--ck-accent`. Default `'#2B50D8'`. */
  accent?: string;
  /** Corner radius, exposed as `--ck-radius`. Default `'10px'`. */
  radius?: string;
  /** v0.2. Default `'auto'` — follows `prefers-color-scheme`. */
  mode?: 'auto' | 'light' | 'dark';
  /** v0.2. Overrides the built-in dark palette. */
  dark?: CkDarkTheme;
}

/** Whether a category is offered in the preferences panel at all. */
export interface CkCategoryConfig {
  enabled?: boolean;
}

export interface CkCategoriesConfig {
  functional?: CkCategoryConfig;
  analytics?: CkCategoryConfig;
  marketing?: CkCategoryConfig;
}

export interface CkIntegrationsConfig {
  /** Google Consent Mode v2 signals. Default `true`. */
  gcm?: boolean;
  /** Push consent events to `window.dataLayer`. Default `true`. */
  gtmDataLayer?: boolean;
}

/** One declared cookie, shown under its category in the preferences panel. */
export interface CkCookieTableEntry {
  name: string;
  category: CkCategory;
  vendor?: string;
  purpose?: string;
  expiry?: string;
}

/** Configuration accepted by `init()`. Every field is optional. */
export interface CkConfig {
  /** Bump to invalidate stored decisions and re-show the banner. Default `'1'`. */
  policyVersion?: string | number;
  /** `'auto'` resolves from `navigator.language`. Default `'auto'`. */
  language?: string;
  layout?: CkLayoutConfig;
  theme?: CkThemeConfig;
  categories?: CkCategoriesConfig;
  /** Lifetime of the stored decision, in days. Default `365`. */
  consentTtlDays?: number;
  integrations?: CkIntegrationsConfig;
  cookieTable?: CkCookieTableEntry[];
}

/** Detail payload of `ck:init`. */
export interface CkInitEventDetail {
  state: CkState;
  config: CkConfig;
}

/** Detail payload of `ck:consent` and `ck:change`. */
export interface CkStateEventDetail {
  state: CkState;
}

/** The public API, also available as `window.ConsentKit`. */
export interface ConsentKitApi {
  readonly version: string;
  /** The merged, effective config. Populated by `init()`. */
  config: CkConfig;
  /** Idempotent. Restores stored state, then dispatches `ck:init`. */
  init(config?: CkConfig): CkState;
  allowed(category: CkCategory | string): boolean;
  getState(): CkState;
  /** `accept('all')` grants everything; an object records `method: 'custom'`. */
  accept(choice?: CkAcceptArg): CkState;
  rejectAll(): CkState;
  /** Clears storage and known cookies, sets `decided:false`, sends GCM denied. */
  withdraw(): CkState;
  /** Dispatches `ck:ui:open-preferences`. */
  show(): void;
  /** Dispatches `ck:ui:close`. */
  hide(): void;
}

declare const ConsentKit: ConsentKitApi;

export default ConsentKit;
export { ConsentKit };

export declare function init(config?: CkConfig): CkState;
export declare function allowed(category: CkCategory | string): boolean;
export declare function getState(): CkState;
export declare function accept(choice?: CkAcceptArg): CkState;
export declare function rejectAll(): CkState;
export declare function withdraw(): CkState;
export declare function show(): void;
export declare function hide(): void;

declare global {
  interface Window {
    ConsentKit?: ConsentKitApi;
    /** Extra locale packs contributed by `src/ck-locales.js`. */
    __ckLocales?: Record<string, Record<string, string>>;
  }

  interface DocumentEventMap {
    'ck:init': CustomEvent<CkInitEventDetail>;
    'ck:consent': CustomEvent<CkStateEventDetail>;
    'ck:change': CustomEvent<CkStateEventDetail>;
    'ck:ui:open-preferences': CustomEvent<CkInitEventDetail>;
    'ck:ui:close': CustomEvent<CkStateEventDetail>;
  }
}

declare module 'consentkit' {
  const ConsentKit: ConsentKitApi;
  export default ConsentKit;
  export { ConsentKit };
  export function init(config?: CkConfig): CkState;
  export function allowed(category: CkCategory | string): boolean;
  export function getState(): CkState;
  export function accept(choice?: CkAcceptArg): CkState;
  export function rejectAll(): CkState;
  export function withdraw(): CkState;
  export function show(): void;
  export function hide(): void;
}

declare module 'consentkit/core' {
  const ConsentKit: ConsentKitApi;
  export default ConsentKit;
  export { ConsentKit };
  export function init(config?: CkConfig): CkState;
  export function allowed(category: CkCategory | string): boolean;
  export function getState(): CkState;
  export function accept(choice?: CkAcceptArg): CkState;
  export function rejectAll(): CkState;
  export function withdraw(): CkState;
  export function show(): void;
  export function hide(): void;
}

/** Return value of `useConsent()`. */
export interface UseConsentResult {
  /** Current state. On the server, an undecided snapshot. */
  state: CkState;
  allowed(category: CkCategory | string): boolean;
  /** Defaults to `'all'` when called with no argument. */
  accept(choice?: CkAcceptArg): CkState;
  rejectAll(): CkState;
  withdraw(): CkState;
  /** Opens the preferences panel. */
  show(): void;
}

declare module 'consentkit/react' {
  /**
   * Subscribes to `ck:init` / `ck:consent` / `ck:change` and re-renders on
   * change. SSR-safe: returns `decided:false` and no-op actions on the server.
   */
  export function useConsent(): UseConsentResult;
  export default useConsent;
}
