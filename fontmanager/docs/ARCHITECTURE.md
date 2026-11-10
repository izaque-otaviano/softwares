# Arquitetura

```
 React UI ──invoke/events──> src-tauri (comandos) ──> fm-core::FontManager
                                                        ├─ db (SQLite)        catálogo remoto │ cache │ ativações │ favoritos │ coleções │ configurações │ histórico
                                                        ├─ providers (trait)  fontsource │ google │ bunny │ fontshare(indisponível)
                                                        ├─ dedup / css / validate / cache / inventory
                                                        └─ fm-native::FontBackend  Windows │ macOS │ Linux
```

## Provedores (adaptadores)
`FontProvider` (`crates/fm-core/src/providers/mod.rs`) expõe `fetch_catalog` e `resolve_files`. Para
acrescentar um provedor: implemente o trait e registre-o em `Registry::new()`. O núcleo não muda.

| Provedor | Catálogo | Prévia/CDN | Arquivos TTF/OTF | Observações |
|---|---|---|---|---|
| Fontsource | `api.fontsource.org/v1/fonts` | jsDelivr | quando a API publica `ttf` para a variante | espelha o Google Fonts (`type: google`) |
| Google Fonts | Developer API (chave gratuita, opcional) | `fonts.googleapis.com/css2` | CSS2 API sem User-Agent de navegador → URLs `.ttf` em `fonts.gstatic.com` | sem chave, o catálogo vem do Fontsource |
| Bunny Fonts | — (catálogo compartilhado) | `fonts.bunny.net/css2` | não (só WOFF2) | só para famílias de origem Google |
| Font Squirrel | `/api/fontlist/all` (1.036 famílias em 2026-11-10) | imagem PNG oficial (`familyinfo.listing_image`) | ZIP `/fonts/download/{id}` com os originais + licença; MD5 de cada arquivo conferido com o `familyinfo` | licença só conhecida ao baixar; ver regra abaixo |
| Fontshare | — | — | — | **não implementado**, ver LIMITATIONS |

**Deduplicação** (`dedup.rs`): mesma família = nome normalizado igual **e** licenças não conflitantes.
Origem, versão, licença, subsets, eixos e variantes ficam em `family_sources`/`source_variants` por
provedor. Licença conflitante gera uma família separada (`chave~provedor`).

### Font Squirrel: pacotes e regra de licença
O pacote é extraído em memória (`archive.rs`: limite de entradas e de bytes descompactados contra zip bomb,
só o nome do arquivo é usado — sem path traversal). Cada arquivo tem o MD5 conferido contra o publicado na API
**antes** de qualquer gravação; peso/estilo vêm das tabelas da própria fonte. A licença é identificada pelo
arquivo `.txt` do pacote e gravada em `source_licenses`.
**Regra:** OFL e Apache ativam direto. Qualquer outra (inclusive "Freeware", sem licença explícita, ou pacote
sem licença) devolve `outcome = "license_required"` com o texto integral: os arquivos ficam baixados, mas
**nada é registrado no SO** até o usuário aceitar. O aceite fica em `license_acceptances` e só vale para a
mesma licença — se o pacote mudar de licença, a pergunta volta.

## Banco (`migrations/001_init.sql`, `002_packages_licenses.sql`)
Catálogo remoto (`families`, `family_sources`, `source_variants`, `source_files`) é separado do
inventário local (`local_fonts`), do cache (`cache_files`), das ativações (`activations` +
`activation_refs`), das preferências (`favorites`, `collections`, `settings`) e do `operation_log`.
`PRAGMA foreign_keys=ON`; `activations.cache_file_id` é `ON DELETE RESTRICT` (não se apaga um arquivo ativo).

## Ativação (`service.rs`)
1. Se a família já existe no sistema (inventário local) e não foi ativada por este app → nada é feito.
2. `plan_files`: valida as variantes pedidas contra o catálogo (o CSS2 do Google *sintetiza* pesos
   inexistentes, então não confiamos nele), escolhe o provedor e os arquivos TTF/OTF.
3. `FontCache::ensure`: download com limite/timeout/origens permitidas → validação (assinatura, tabelas,
   cmap, glifos, truncamento) → SHA-256 → escrita atômica em caminho sanitizado.
4. `backend.register` (blocking) por arquivo; qualquer falha **desfaz** o que a operação registrou.
5. `activation_refs` conta donos (`family:<chave>`, `collection:<id>`): só o último dono desregistra.
6. Eventos reais para a UI: `Resolving → Downloading → Registering → ActiveInSystem → WaitingApp | Error`.

### Os três estados
1. **Registrada no SO** — `RegisterReport.registered`.
2. **Aplicativos notificados** — Windows: `WM_FONTCHANGE` via `SendMessageTimeoutW(HWND_BROADCAST, SMTO_ABORTIFHUNG)`;
   macOS: notificação emitida pelo próprio Core Text; Linux: `fc-cache`.
3. **Reconhecida pelo aplicativo** — **nunca** marcada como confirmada (`AppRecognition::NotVerifiable`).
   Existe apenas uma verificação cruzada opcional: um processo novo enumera as fontes do SO.

### Windows
`AddFontResourceExW(path, 0, NULL)` — sem `FR_PRIVATE`, para valer em outros processos. Escopo *sessão*: só isso
(some no logoff). Escopo *persistente por usuário*: além disso, valor `FontManager: <nome> (TrueType|OpenType)` em
`HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts` apontando para o arquivo do cache (Windows 10 1809+,
sem administrador). `RemoveFontResourceExW` é repetido até zerar a contagem do SO; só valores com o prefixo do app são removidos.

### macOS
`CTFontManagerRegisterFontsForURL/UnregisterFontsForURL` com `Session` ou `Persistent` (= `User`). `Process` não é
usado (só valeria para o próprio processo).

## Segurança
HTTPS apenas, lista fixa de hosts (também em redirecionamentos), sem credenciais na URL, timeouts, limite de tamanho
por resposta, validação estrutural de fontes, hash do cache reconferido antes de cada registro, caminhos relativos
validados segmento a segmento, privilégios mínimos do Tauri (`core:default`, `dialog:allow-open`), CSP restrita,
chave de API nunca devolvida à UI, nenhum script de provedor é executado (só CSS/WOFF2 de prévia pelo navegador).
