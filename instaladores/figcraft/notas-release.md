## FigCraft {VERSAO}

Baixe o arquivo do seu computador e abra. Não precisa instalar mais nada.

| Sistema | Arquivo |
|---|---|
| **Windows 10/11** (a maioria dos PCs) | `FigCraft-{VERSAO}-Windows-x64-Setup.exe` |
| Windows em ARM (Snapdragon) | `FigCraft-{VERSAO}-Windows-arm64-Setup.exe` |
| **macOS 11 ou mais novo** (Apple silicon e Intel) | `FigCraft-{VERSAO}-macOS-Universal.dmg` |
| macOS: `figcraft-cli`, para ligar o Claude ao FigCraft (opcional) | `figcraft-cli-{VERSAO}-macOS-Universal.zip` |

**Windows:** dê dois cliques no `.exe` e siga as 3 telas. Se o Windows mostrar "O Windows protegeu o
computador", clique em *Mais informações › Executar assim mesmo*.

**Mac:** abra o `.dmg` e arraste o FigCraft para a pasta Aplicativos. Na primeira vez, clique com o
botão direito no FigCraft em Aplicativos e escolha *Abrir*.

**Claude no Mac (opcional):** descompacte o `figcraft-cli-{VERSAO}-macOS-Universal.zip`, guarde o
`figcraft-cli` numa pasta sua (por exemplo `~/bin`) e, na primeira vez, rode no Terminal
`xattr -d com.apple.quarantine ~/bin/figcraft-cli`. No Windows o `figcraft-cli` já vem no instalador.
Passo a passo em [`docs/mcp.md`](https://github.com/izaque-otaviano/softwares/blob/{COMMIT}/figcraft/docs/mcp.md).

Compilado de [izaque-otaviano/softwares](https://github.com/izaque-otaviano/softwares) (pasta
[`figcraft/`](https://github.com/izaque-otaviano/softwares/tree/{COMMIT}/figcraft), `{REF}`), baseado em
[storytold/figcraft](https://github.com/storytold/figcraft), sob MIT ou Apache-2.0. `SHA256SUMS.txt` traz o
checksum de cada arquivo.
