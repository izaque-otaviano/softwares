# Brief: ícone "mão em V com lápis" para o VectorCraft

## O que é
Ícone de app (squircle 1024×1024, grade do macOS). Uma mão fazendo o sinal de "V" (paz), em que o
dedo indicador e o dedo médio são DOIS LÁPIS. Estilo flat/cartoon: contorno preto grosso e
uniforme, cores chapadas, sem degradê, sem sombra. Fundo amarelo.

Referência visual (abra com a ferramenta Read para ver): `/root/.claude/uploads/e91b1203-da4e-5e42-9cdb-6a036b7511c0/53ea055f-image.jpg`
NÃO copie a referência; desenhe sua própria mão com a mesma ideia e o mesmo estilo de traço.

## Versão anterior (rejeitada pelo cliente: "não parece uma mão")
`/home/user/uploader-convertize/icones/opcoes/vectorcraft-4-paz.png` (código em `/home/user/uploader-convertize/icones/paz.py`).
Problemas: o punho é um blob sem volume; os dois dedos dobrados parecem duas pílulas soltas; o
polegar parece uma faixa/cinta; faltam nós dos dedos e a dobra do polegar por cima dos dedos.

## O que faz uma mão em V ser lida como mão (use isso)
- Palma/punho com volume: um bloco arredondado, mais largo em cima (nós) e levemente estreito
  embaixo (pulso), ou um pulso/punho de manga aparecendo na base.
- Dois dedos dobrados (anelar e mínimo) à esquerda, lidos como DOIS NÓS/dobras em sequência: cada
  um é um "U" invertido ou uma cápsula que nasce do topo do punho e desce, com uma linha de dobra
  interna (segunda falange). Eles têm larguras ligeiramente diferentes (mínimo mais fino).
- Polegar dobrado por cima dos dedos, na frente: forma afunilada que sai do lado direito, cruza
  diagonalmente e termina numa ponta arredondada SOBRE os dedos dobrados (sobreposição real: o
  polegar tapa parte dos dedos). Uma linha curta marca a dobra/unha.
- Os dois lápis nascem do topo do punho com um pequeno vão entre eles (como o V) e inclinam ±18–22°.
  O punho cobre a base dos lápis.
- Uma ou duas linhas de dobra na palma (abaixo do polegar) dão volume.
- Legível a 64 px e a 32 px: formas gordas, poucos detalhes finos.

## Regras técnicas (obrigatórias)
- Python 3. Importe a moldura: `sys.path.insert(0, "/home/user/uploader-convertize/icones"); from gerar_icones import SQ, icon`.
  `icon(defs, bg, body, glass=False)` devolve o SVG completo (clip no squircle, sombra externa).
  `SQ` é o path do squircle (centro 512, meio-lado 412). Preencha o fundo com `<path d="{SQ}" fill="{BG}"/>`
  como primeira coisa do `body`.
- Cores: fundo `#f7b928`; traço `#15151a` com `stroke-width` 30, `stroke-linejoin="round"`,
  `stroke-linecap="round"`; mão `#ffffff`; lápis `#ffe14d`; borracha `#ff6f7d`; madeira `#fde9c6`.
- Lápis: largura ~120; esquerdo com BORRACHA para cima (borracha rosa + virola branca com duas
  faixas pretas), direito com PONTA para cima (madeira apontada + grafite preto). Duas linhas finas
  (12 px) ao longo do corpo de cada lápis.
- Tudo dentro de 84..940 em x e y (margem do squircle). Nada pode vazar.
- Renderize com `resvg -w 1024 in.svg out.png` (resvg está no PATH) e também gere uma versão
  64×64 (`resvg -w 64`) para conferir legibilidade.
- OBRIGATÓRIO: depois de cada render, ABRA o PNG com a ferramenta Read e olhe. Itere pelo menos
  3 vezes corrigindo o que não parece mão. Só termine quando você, olhando de longe, veria uma mão
  fazendo V com dois lápis.

## Entrega
Escreva seu script em `/home/user/uploader-convertize/icones/candidatos/paz-<ID>.py` (ID dado no
prompt), que gere `paz-<ID>.svg`, `paz-<ID>.png` (1024) e `paz-<ID>-64.png` na mesma pasta.
Não toque em nenhum outro arquivo.
