# softwares
Meus softwares

## IconHub

App de ícones para Mac e Windows, no estilo do The Noun Project: busca em mais de 70 mil ícones de 33 coleções (Lucide, Material Symbols, Tabler, Phosphor, Fluent e outras), arrasta direto para o Illustrator, Figma ou Photoshop, pastas por projeto, favoritos, importação dos seus SVGs e sincronização entre computadores.

- Código: [`iconhub/`](iconhub/)
- Instaladores: [Releases](../../releases) (DMG para Mac Apple Silicon e Intel, `.exe` para Windows 64 bits)

## VectorCraft

Editor de ilustração vetorial (Mac e Windows). Baseado em [storytold/vectorcraft](https://github.com/storytold/vectorcraft), com tema escuro e nova tela de criar arquivo.

- Código: [`vectorcraft/`](vectorcraft/)
- Instaladores: [Releases](../../releases) (DMG universal para Mac, `.exe` para Windows x64 e ARM)

## PhotoCraft

Editor de imagens (Mac e Windows). Baseado em [storytold/photocraft](https://github.com/storytold/photocraft), com tema escuro e nova tela de criar arquivo.

- Código: [`photocraft/`](photocraft/)
- Instaladores: [Releases](../../releases)

## FilmCraft

Editor de vídeo (Mac e Windows). Baseado em [storytold/filmcraft](https://github.com/storytold/filmcraft), com tema escuro e nova tela de criar projeto.

- Código: [`filmcraft/`](filmcraft/)
- Instaladores: [Releases](../../releases)

## FigCraft

Design de interfaces e protótipos (Mac e Windows). Baseado em [storytold/figcraft](https://github.com/storytold/figcraft), com canvas mais fluido, menus corrigidos, nova barra de apresentação (atalhos, painel de telas, fundo, janela separada) e vídeo em protótipos.

- Código: [`figcraft/`](figcraft/)
- Instaladores: [Releases](../../releases)

## Helpdesk

Protótipo de sistema de tickets de atendimento (React, TypeScript, Vite e Tailwind): área do agente com abas de trabalho, visualizações, tela do ticket com macros e envio por status, clientes, organizações e busca, Quadro Kanban, Chat de atendimento e Relatórios, mais a administração (membros, campos, status, gatilhos, macros, SLA, calendários, planos, backups, avisos, auditoria, retenção, LGPD, notificações e segurança da conta). Funciona com dados de exemplo (`npm run dev`) ou ligado ao backend do Resolv (`npm run dev:real`), com login, leitura e escrita reais.

- Código: [`helpdesk/`](helpdesk/) (instruções em [`helpdesk/README.md`](helpdesk/README.md))
- O que falta e os problemas conhecidos do backend: [`helpdesk/PENDENCIAS.md`](helpdesk/PENDENCIAS.md)

## Resolv

Sistema de tickets e chat de atendimento: backend em Django/DRF (com Channels para tempo real) e front-end em React. É o backend ao qual o Helpdesk se liga.

- Código: [`resolv/`](resolv/) (instruções em [`resolv/README.md`](resolv/README.md))
- Copiado de `izaqueotaviano/Resolv` (hoje CDesk), branch `claude/ticket-system-8tsh8q`, commit `7cc6389`, sem o histórico anterior.

## Instaladores

Os instaladores de VectorCraft, PhotoCraft, FilmCraft e FigCraft (DMG universal para Mac, `.exe`
para Windows x64 e ARM) são compilados aqui mesmo, a partir das pastas de cada app, com os arquivos
de [`instaladores/<app>/`](instaladores/). Para gerar uma versão nova:

- No GitHub, abra **Actions ▸ <App> installers ▸ Run workflow** (por exemplo *FigCraft installers*),
  deixe *ref* em `main` (ou informe outra branch, tag ou commit) e clique em **Run workflow**; ou
- envie uma tag `<app>-build-N`, por exemplo `git tag figcraft-build-1 && git push origin figcraft-build-1`.

O build leva de 30 a 45 minutos e publica os arquivos (com `SHA256SUMS.txt`) na Release
`<app>-v<versão>` da aba [Releases](../../releases), substituindo os de mesmo nome se ela já existir.

VectorCraft, PhotoCraft, FilmCraft e FigCraft são licenciados como MIT OR Apache-2.0 (veja `LICENSE-MIT`, `LICENSE-APACHE` e `NOTICE` em cada pasta).

## Uploader Convertize

App Uploader (Python) e as ferramentas que geravam os instaladores dos apps acima.

- Código: [`uploader-convertize/`](uploader-convertize/)
- Copiado de `izaqueotaviano/uploader-convertize`. Os workflows que estão dentro de `uploader-convertize/.github/` não rodam a partir desta pasta; para gerar o executável do Uploader, eles precisam ficar em `.github/workflows/` na raiz do repositório.
