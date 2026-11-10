import type {
  ActivationReport, AppInfo, CatalogPage, CatalogQuery, Collection, CssOutput, CssRequest,
  DeactivationReport, FamilyDetail, LocalFamily, LogEntry, Phase, ProviderInfo, Scope, VariantView,
} from "./types";
import { mockInvoke } from "./mock";

/** Dentro do Tauri usa o IPC real; no navegador (dev/UI) cai no modo demonstração. */
export const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!IS_TAURI) return mockInvoke(cmd, args) as Promise<T>;
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(typeof e === "string" ? e : (e as Error)?.message ?? String(e));
  }
}

export async function listen<T>(event: string, cb: (payload: T) => void): Promise<() => void> {
  if (!IS_TAURI) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(event, (e) => cb(e.payload));
}

export const api = {
  queryCatalog: (query: CatalogQuery) => call<CatalogPage>("query_catalog", { query }),
  familyDetail: (key: string) => call<FamilyDetail>("family_detail", { key }),
  previewImage: (key: string) => call<string | null>("preview_image", { key }),
  categories: () => call<string[]>("categories"),
  providers: () => call<ProviderInfo[]>("list_providers"),
  setProviderEnabled: (id: string, enabled: boolean) => call<void>("set_provider_enabled", { id, enabled }),
  sync: (provider?: string) => call<{ providerId: string; report?: { inserted: number; updated: number; removed: number }; error?: string }[]>("sync_catalog", { provider }),
  activate: (key: string, options?: { variants?: VariantView[]; scope?: Scope; acceptLicense?: boolean }) => call<ActivationReport>("activate_font", { key, options }),
  download: (key: string) => call<number>("download_font", { key }),
  deactivate: (key: string) => call<DeactivationReport>("deactivate_font", { key }),
  activateCollection: (id: number) => call<{ key: string; report?: ActivationReport; error?: string }[]>("activate_collection", { id }),
  deactivateCollection: (id: number) => call<DeactivationReport[]>("deactivate_collection", { id }),
  deactivateAll: () => call<number>("deactivate_all"),
  checkVisibility: (family: string) => call<boolean | null>("check_visibility", { family }),
  generateCss: (key: string, request: CssRequest) => call<CssOutput>("generate_css", { key, request }),
  exportSelfHosted: (key: string, request: CssRequest, dest: string) => call<string[]>("export_self_hosted", { key, request, dest }),
  cachedFontBytes: (key: string, weight?: number, italic?: boolean) => call<ArrayBuffer>("cached_font_bytes", { key, weight, italic }),
  setFavorite: (key: string, on: boolean) => call<void>("set_favorite", { key, on }),
  collections: () => call<Collection[]>("list_collections"),
  createCollection: (name: string) => call<Collection>("create_collection", { name }),
  renameCollection: (id: number, name: string) => call<void>("rename_collection", { id, name }),
  deleteCollection: (id: number) => call<void>("delete_collection", { id }),
  collectionMember: (id: number, key: string, member: boolean) => call<void>("collection_member", { id, key, member }),
  localFonts: (text: string | undefined, offset: number, limit: number, rescan: boolean) => call<[number, LocalFamily[]]>("local_fonts", { text, offset, limit, rescan }),
  settings: () => call<[string, string][]>("get_settings"),
  setSetting: (key: string, value: string) => call<void>("set_setting", { key, value }),
  appInfo: () => call<AppInfo>("app_info"),
  recentLog: (limit: number) => call<LogEntry[]>("recent_log", { limit }),
};

export type { Phase };

export async function pickFolder(): Promise<string | null> {
  if (!IS_TAURI) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory: true, multiple: false });
  return typeof r === "string" ? r : null;
}
