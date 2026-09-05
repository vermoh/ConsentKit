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
  /** `bar`: `'bottom'` (default) | `'top'`. `box`: `'bottom-left'` (default) | `'bottom-right'`. */
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

/** v0.4.0 (§2). How much the blocking engine holds back before consent. */
export interface CkBlockingConfig {
  /**
   * `'known'` (default) blocks what the tracker database recognises.
   * `'strict'` additionally intercepts EVERY third-party `<script src>` and
   * `<iframe src>` that is not same-site, not in `allow`, not in the built-in
   * allowlist (`ConsentKit._baseAllow`) and not an already-granted
   * necessary/functional host. Interceptions are filed under `marketing`.
   */
  mode?: 'known' | 'strict';
  /** Hosts strict mode must never intercept. Suffix match: `p.com` covers `cdn.p.com`. */
  allow?: string[];
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
  /** v0.4.0. Default `{ mode: 'known', allow: [] }`. */
  blocking?: CkBlockingConfig;
  /**
   * v0.4.0 (§1.3). Extra `host: category` pairs merged into the tracker
   * database. `init()` applies them before its initial scan, so scripts
   * already in the markup are classified against them. In SaaS mode the
   * service supplies this; `_extendHostDb()` does the same at any later point.
   */
  hostdb?: Record<string, CkCategory>;
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

  /**
   * v0.4.0 (§1.3). Merges `{ host: category }` into the runtime tracker
   * database and returns how many pairs were accepted. Matching follows the
   * built-in table: a bare domain also covers its subdomains, and an override
   * wins over the shipped classification for the same host.
   *
   * Safe before AND after `init()`. Afterwards, nothing already inserted is
   * re-examined — a script that has loaded cannot be unloaded — but every
   * later insertion is classified against the extended map.
   */
  _extendHostDb(map: Record<string, CkCategory>): number;

  /**
   * v0.4.0 (§2). The built-in strict-mode allowlist, as hosts plus a few
   * `host/path` entries (reCAPTCHA). A copy: mutating it changes nothing.
   *
   * Since v0.4.1 this includes the whole of `_infra()`.
   */
  readonly _baseAllow: string[];

  /**
   * v0.4.1 (§8). The infrastructure list: CDNs and static hosts of site
   * builders and hosting platforms, general asset CDNs, fonts and captcha.
   *
   * A CLASS of host, not a consent category — these serve the site's own
   * assets, so there is no consent decision to make about them. Strict mode
   * never intercepts them, and the SaaS scanner keeps them out of the report.
   * A copy: mutating it changes nothing.
   */
  _infra(): string[];

  /**
   * v0.4.1 (§8). Whether a URL — or a bare hostname — is infrastructure.
   */
  _isInfra(url: string): boolean;

  /** The category the engine would assign to a URL, or `null` if unknown. */
  _categoryForUrl(url: string): CkCategory | null;

  /** What is currently held back, host+path only — never a query string. */
  _blocked(): CkBlockedEntry[];
}

/** One entry of `ConsentKit._blocked()`. */
export interface CkBlockedEntry {
  host: string;
  path: string;
  /** `'script'`, `'iframe'`, … */
  kind: string;
  category: CkCategory | null;
  /** `'engine'` — intercepted by the patches; `'markup'` — marked up by hand. */
  origin: 'engine' | 'markup';
  /** v0.4.0. True when strict mode held this back, i.e. the host is unknown. */
  strict: boolean;
  /**
   * v0.4.0. `false` when the category was granted but the element still never
   * loaded — typically a script created and given a `src` without ever being
   * appended, which `applyConsentToDom()` cannot reach. Such entries stay in
   * the report after consent precisely so they can be diagnosed.
   */
  revived: boolean;
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
export declare function _extendHostDb(map: Record<string, CkCategory>): number;

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

declare module '@ecomconsult/consentkit' {
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

declare module '@ecomconsult/consentkit/core' {
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

declare module '@ecomconsult/consentkit/react' {
  /**
   * Subscribes to `ck:init` / `ck:consent` / `ck:change` and re-renders on
   * change. SSR-safe: returns `decided:false` and no-op actions on the server.
   */
  export function useConsent(): UseConsentResult;
  export default useConsent;
}
