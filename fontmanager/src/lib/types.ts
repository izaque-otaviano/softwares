// Espelha os tipos serializados pelo núcleo Rust (serde, camelCase).
export type Style = "normal" | "italic";
export type ActivationState = "inactive" | "active" | "partial" | "system";
export type Scope = "session" | "persistent";

export interface FamilySummary {
  key: string;
  name: string;
  category: string | null;
  providers: string[];
  weights: number[];
  hasItalic: boolean;
  variable: boolean;
  license: string | null;
  favorite: boolean;
  state: ActivationState;
  cached: boolean;
  installable: boolean;
  previewCdn: "google" | "fontsource" | "fontsquirrel" | null;
  previewId: string | null;
}
export interface Axis { tag: string; min: number; max: number; default: number }
export interface VariantView { weight: number; style: Style }
export interface SourceView {
  providerId: string; providerFamilyId: string; origin: string | null; version: string | null;
  license: string | null; licenseUrl: string | null; lastModified: string | null;
  subsets: string[]; variable: boolean; axes: Axis[]; variants: VariantView[];
}
export interface FamilyDetail { summary: FamilySummary; sources: SourceView[]; collections: number[] }
export interface CatalogQuery {
  text?: string; category?: string; provider?: string; variableOnly: boolean; italicOnly: boolean;
  view?: string; collectionId?: number; offset: number; limit: number;
}
export interface CatalogPage { total: number; items: FamilySummary[] }
export interface ProviderInfo {
  id: string; name: string; hasCatalog: boolean; canInstallFiles: boolean; hasCdn: boolean;
  status: "ok" | "needs_config" | "not_available"; note: string | null;
}
export interface Collection { id: number; name: string; count: number }
export interface LocalFamily { family: string; faces: number; samplePath: string }
export interface LogEntry { id: number; ts: string; kind: string; familyKey: string | null; status: string; detail: string | null }
export interface AppInfo {
  version: string; backend: string; os: string; defaultScope: Scope; cacheBytes: number; catalogCount: number;
}

export type Phase =
  | { phase: "resolving" }
  | { phase: "downloading"; done: number; total: number }
  | { phase: "registering" }
  | { phase: "active_in_system" }
  | { phase: "waiting_app" }
  | { phase: "error"; message: string };

export interface ActivationReport {
  familyKey: string; familyName: string; outcome: "activated" | "already_in_system" | "license_required";
  providerUsed: string | null; files: number; registeredInOs: boolean;
  notification: "broadcast" | "emitted_by_system" | "cache_refreshed" | "not_sent";
  visibleToNewProcesses: boolean | null; appRecognition: "not_verifiable"; scope: Scope; message: string;
  license: string | null; licenseText: string | null;
}
export interface DeactivationReport {
  familyKey: string; unregistered: number; keptByOtherOwners: number; notification: string; warnings: string[];
}

export type Cdn = "google" | "bunny" | "fontsource" | "self_hosted";
export interface CssRequest { cdn: Cdn; weights: number[]; styles: Style[]; variable: boolean; display: string; subsets: string[] }
export interface CssOutput {
  linkHtml: string | null; importCss: string | null; fontFamilyRule: string; fontFaceCss: string | null;
  react: string; nextjs: string; notes: string[]; selfHostFiles: { weight: number; style: Style; variable: boolean; fileName: string }[];
}
