# Font Manager

Gerenciador de fontes desktop (Windows e macOS), gratuito, local e sem servidor próprio.
Pesquisa fontes de provedores gratuitos, mostra prévias **sem instalar**, ativa/desativa fontes no
sistema, gera CSS para a web e funciona offline com o que já foi baixado.

Stack: **Tauri 2** · Rust · React + TypeScript · Vite · Tailwind CSS 4 · componentes estilo shadcn/ui + Lucide ·
Zustand · TanStack Query/Virtual · SQLite (rusqlite).

## Estrutura

```
fontmanager/
├─ crates/fm-native   camada nativa: Windows (GDI/WM_FONTCHANGE/HKCU), macOS (Core Text), Linux (fontconfig, dev/CI)
├─ crates/fm-core     banco SQLite + migrações, provedores, deduplicação, CSS, cache/validação, ativação
├─ src-tauri          shell Tauri 2: comandos finos, eventos e ciclo de vida
├─ src                interface React (lista virtualizada, detalhes, "Usar na Web", coleções, configurações)
└─ docs               ARCHITECTURE · TESTING · LIMITATIONS
```

## Desenvolvimento

```bash
npm install
npm run tauri dev          # app desktop (requer Rust e as dependências do Tauri 2 do seu SO)
npm run dev                # só a interface, no navegador, em MODO DEMONSTRAÇÃO (sem backend nativo)

cargo test -p fm-native -p fm-core      # núcleo
FM_OS_TESTS=1 cargo test -p fm-native --test os_integration -- --test-threads=1   # registra uma fonte de teste NO SEU SO
npm test && npm run typecheck           # interface
npm run tauri build                     # instaladores (.exe NSIS / .app + .dmg)
```

Instaladores também saem da CI: *Actions → Font Manager CI → Run workflow (bundle = true)*.

Leia **[docs/LIMITATIONS.md](docs/LIMITATIONS.md)** antes de assumir compatibilidade com algum aplicativo.
