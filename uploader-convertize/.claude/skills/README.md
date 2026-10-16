# Skills do Claude Code neste repositório

O Claude Code carrega sozinho as skills desta pasta em toda sessão aberta neste repositório.

| Skill | Para que serve | Origem | Licença |
|---|---|---|---|
| `discover-wasm` (+ a pasta `wasm/`) | Guia de WebAssembly: fundamentos, Rust para WASM (wasm-pack, wasm-bindgen), integração com o navegador e WASM no servidor. A skill aponta para os 4 documentos em `wasm/`. | [rand/cc-polymath](https://github.com/rand/cc-polymath), `skills/discover-wasm` e `skills/wasm`, commit `baa2df1` | MIT (`LICENSE`) |
| `rust` | Boas práticas de Rust e de interfaces multiplataforma (egui, iced, Tauri…). | [brenordv/rust-pad](https://github.com/brenordv/rust-pad), `.claude/skills/rust/SKILL.md` no commit `55b16bb` (o autor removeu a skill do repositório depois) | GPL-3.0-only (`LICENSE.md`) |

Equivale a `npx skillfish add rand/cc-polymath discover-wasm` e
`npx skillfish add brenordv/rust-pad rust --project`. As cópias são fiéis aos originais, sem
alterações.

Duas regras da skill `rust` não valem para o FigCraft e os outros apps da ArtCraft. A própria skill
manda seguir as convenções do repositório:

- **Erros:** ela pede `anyhow` e proíbe `thiserror`, mas esses projetos usam `thiserror`.
- **Commits:** ela diz para nunca fazer commit, mas aqui os commits fazem parte do fluxo de trabalho.
