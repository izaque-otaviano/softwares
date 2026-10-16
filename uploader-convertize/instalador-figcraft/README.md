# Instaladores do FigCraft (.dmg e .exe)

Instaladores simples e no padrão Apple para o [FigCraft](https://github.com/storytold/figcraft),
o app open source de design de interfaces (frames, auto layout, componentes, variáveis e protótipos;
MIT ou Apache-2.0) da equipe ArtCraft.

| Sistema | Arquivo | Como instala |
|---|---|---|
| macOS 11+ (Apple silicon e Intel) | `FigCraft-<versão>-macOS-Universal.dmg` | Abre uma janela e você arrasta o app para **Aplicativos** |
| Windows 10/11 x64 | `FigCraft-<versão>-Windows-x64-Setup.exe` | Assistente de 3 telas: Boas-vindas, Opções, Pronto |
| Windows 10/11 ARM | `FigCraft-<versão>-Windows-arm64-Setup.exe` | Igual ao x64 |

## Como gerar

1. No GitHub, abra **Actions › FigCraft installers › Run workflow**.
2. Em *ref*, deixe `main` (ou informe uma tag do FigCraft, como `v0.6.0`) e clique em **Run workflow**.
3. Quando terminar (cerca de 30 a 45 minutos: o FigCraft é compilado do zero), os instaladores
   aparecem na aba **Releases** do repositório, como `FigCraft <versão>`. É só baixar o `.exe` ou
   o `.dmg` e abrir.

O workflow está em [`.github/workflows/figcraft-instaladores.yml`](../.github/workflows/figcraft-instaladores.yml).
Ele baixa o código do FigCraft, compila com os scripts do próprio projeto e empacota com os arquivos
desta pasta. No Windows ele também instala o `.exe` em silêncio, roda o `figcraft-cli --version` e
desinstala, para garantir que o instalador funciona.

## macOS: o DMG

![Janela do DMG](arte/previa-dmg.png)

- Janela limpa de 660 × 400 pt, sem barra de ferramentas nem barra lateral, com fundo claro, título,
  instrução curta e uma seta do app para **Aplicativos**, como nos apps da Apple.
- Fundo HiDPI (1x e 2x no mesmo TIFF), nítido em telas Retina.
- O disco montado mostra o ícone do FigCraft.
- Binário universal: um único DMG para Mac com Apple silicon e Intel.
- O layout já vem pronto (`macos/DS_Store`), então o DMG é gerado sem AppleScript nem Finder,
  e o build no CI não trava.

**Assinatura.** Sem certificado, o app sai com assinatura *ad-hoc*. Na primeira vez, o macOS pede
confirmação: clique com o botão direito em FigCraft, em **Aplicativos**, e escolha **Abrir**
(ou vá em *Ajustes do Sistema › Privacidade e Segurança › Abrir Mesmo Assim*). Para um DMG que abre
sem esse aviso, cadastre estes *secrets* no repositório (requer uma conta Apple Developer):

| Secret | O que é |
|---|---|
| `APPLE_CERTIFICATE` | Certificado *Developer ID Application* (.p12) em base64 |
| `APPLE_CERTIFICATE_PASSWORD` | Senha do .p12 |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Apple ID, senha de app e Team ID para a notarização |

Com eles, o app e o DMG saem assinados, notarizados e com o ticket da Apple anexado.

## Windows: o .exe

![Telas do instalador do Windows](arte/previa-windows.png)

- Assistente moderno do [Inno Setup](https://jrsoftware.org/isinfo.php), com arte do FigCraft em
  todas as escalas de tela (100% a 250%).
- **Três telas e nada mais:** Boas-vindas › Opções (atalho na Área de Trabalho e abrir arquivos
  `.figcraft`) › Pronto, com "Abrir o FigCraft agora" marcado.
- **Sem pedir senha de administrador:** instala só para o usuário atual, em
  `%LOCALAPPDATA%\Programs\FigCraft`. Para instalar para todos os usuários (em *Arquivos de
  Programas*), rode o instalador com `/ALLUSERS`.
- Português do Brasil ou inglês, conforme o idioma do Windows.
- Registra `.figcraft` e adiciona o FigCraft ao "Abrir com" de SVG, PNG e JPEG sem mudar o app
  padrão desses arquivos (as mesmas associações do MSI oficial).
- Inclui o `figcraft-cli.exe` (exportação, conversão e servidor MCP, sem janela) e funciona com `figcraft` no
  **Executar** (Win+R).
- Desinstala pelo *Configurações › Aplicativos*, removendo o app, os atalhos e os registros.
- Não precisa do Visual C++ Redistributable.

Instalação silenciosa (para TI):

```bat
FigCraft-0.6.0-Windows-x64-Setup.exe /VERYSILENT /SUPPRESSMSGBOXES
FigCraft-0.6.0-Windows-x64-Setup.exe /VERYSILENT /SUPPRESSMSGBOXES /ALLUSERS
```

O `.exe` não é assinado digitalmente, então o SmartScreen pode mostrar "O Windows protegeu o
computador". Clique em **Mais informações › Executar assim mesmo**. Para remover o aviso, é preciso um
certificado de assinatura de código.

## Arquivos

| Arquivo | O que é |
|---|---|
| `macos/criar-dmg.sh` | Monta, assina e (opcionalmente) notariza o DMG a partir do `FigCraft.app` |
| `macos/background.tiff`, `macos/DS_Store` | Fundo e layout da janela do DMG (gerados) |
| `windows/figcraft.iss` | Script do instalador Inno Setup |
| `windows/assistente-*.bmp` | Imagens do assistente em 7 escalas (geradas) |
| `arte/dmg-fundo.svg` | Arte-fonte do fundo do DMG |
| `arte/gerar.py` | Gera as imagens acima a partir do ícone do FigCraft (fonte Inter do VectorCraft) |

Para mudar a arte, edite `arte/dmg-fundo.svg` (ou as constantes de `arte/gerar.py`) e rode, em qualquer
sistema:

```sh
pip install 'pillow>=12' ds_store==1.3.3 mac_alias==2.2.3
cargo install resvg
git clone https://github.com/storytold/figcraft /tmp/figcraft
# O FigCraft não traz a Inter; a do VectorCraft (mesma equipe, OFL) serve.
git clone --depth 1 https://github.com/storytold/vectorcraft /tmp/vectorcraft
python3 instalador-figcraft/arte/gerar.py /tmp/figcraft /tmp/vectorcraft/assets/fonts
```

## Créditos

FigCraft © 2026 ArtCraft Team e colaboradores, sob MIT ou Apache-2.0. O ícone do app tem a mesma
licença ([assets/app-icon/LICENSE.txt](https://github.com/storytold/figcraft/blob/main/assets/app-icon/LICENSE.txt)).
Fonte Inter sob SIL OFL 1.1. A geração do `DS_Store` segue `packaging/macos/dmg/generate.py` do
PhotoCraft. Estes instaladores não usam as marcas ArtCraft.
