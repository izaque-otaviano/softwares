/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'mock' (padrão) | 'real'. */
  readonly VITE_API_MODE?: 'mock' | 'real';
  /** Origem do backend (ex.: http://127.0.0.1:8000). Vazio = relativo, via proxy do Vite. */
  readonly VITE_API_URL?: string;
  /** Alvo do proxy do Vite para /api e /ws (lido pelo vite.config.ts). */
  readonly VITE_API_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
