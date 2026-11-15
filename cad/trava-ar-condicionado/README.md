# Trava plástica de ar-condicionado — v1 (PETG, FDM)

Reprodução da trava quebrada do acabamento frontal, reconstruída por engenharia reversa do
**molde de tinta** (foto 08, calibrada pela régua) e conferida contra as fotos da peça instalada.

| Arquivo | Conteúdo |
|---|---|
| `trava_ar_condicionado_v1.step` | sólido B-rep (1 sólido, BRepCheck válido) |
| `trava_ar_condicionado_v1.stl` | malha fechada (watertight, normais consistentes, 1 corpo) |
| `trava_ar_condicionado_v1.py` | modelo CadQuery paramétrico (gera STEP e STL) |
| `previa_frontal.png`, `previa_lateral.png`, `previa_superior.png` | vistas ortográficas com régua de 5 mm |
| `previa_isometrica.png` | renderização 3D |
| `comparacao_molde.png` | seção do sólido exportado sobre a foto do molde, na escala da régua |
| `relatorio_validacao.json` | resultado das verificações |
| `tools/` | calibração, extração do molde, ajuste, validação e renderização |
| `referencias/` | foto do molde usada e linha média extraída (mm) |

## 1. O que a peça é

Um **perfil extrudado de parede fina**: uma lâmina de ~0,9 mm dobrada em serpentina.
Ela sai do pé esquerdo, sobe, faz um grampo com ponta arredondada e desce com um ressalto em "S".
Depois forma o U central, sobe pelo segundo grampo (mais alto) e desce até o pé direito.
Os "cilindros" das fotos 02–05 são as pontas dos grampos vistas ao longo da extrusão.
Cada gancho é oco (fenda passante ao longo de Z), e é isso que permite fechar elasticamente no encaixe.

Eixos do modelo: **X** atravessa os ganchos, **Y** é a saliência a partir da tampa
(Y = 0 é o topo da base de colagem) e **Z** é a extrusão.

## 2. Como o perfil foi obtido

1. **Foto mais perpendicular:** foto 08. Os 50 intervalos de 1 mm da régua têm 12–13 px
   uniformes (desvio máximo de 1,6 px no ajuste linear), portanto não há perspectiva a corrigir.
   Escala de **12,94 px/mm**.
2. **Tinta ≠ material.** No carimbo, a faixa **cinza** é o contato da face da peça
   (~0,83 mm). O **preto** é tinta espremida para as bordas e acumulada dentro dos canais
   (por exemplo, o canal entre os ganchos e a mancha na base direita). Só a faixa cinza foi usada
   (`tools/extrair_molde.py`): esqueletização → 726 pontos de linha média em mm.
3. **Curvas paramétricas, não pixels.** A linha média é gerada por 24 parâmetros com sentido
   físico: pés, pernas com arqueamento, pontas semi-elípticas, ressaltos (degrau em tangente
   hiperbólica), U central. Esses parâmetros foram ajustados aos pontos do molde por mínimos
   quadrados robustos, dentro de faixas físicas (`tools/ajuste_molde.py`).
   Resultado: **desvio mediano de 0,07 mm** entre molde e CAD (o p90 de 0,41 mm vem dos ramos
   espúrios do esqueleto, visíveis em verde na comparação).
4. **Suavização com garantia de raio:** uma suavização Taubin (que não encolhe o perfil)
   elimina quebras de tangente até que o raio da face côncava mais fechada seja ≥ 0,40 mm.
   A geometria se desloca no máximo 0,06 mm.
5. **Conferência com o segundo carimbo (foto 10):** ele repete o gancho direito mais alto,
   a inclinação do dedo esquerdo, o "S" e o U junto à base. Então a assimetria é real,
   não deformação de um carimbo isolado.

## 3. Dimensões: medidas × estimadas

| Grandeza | Tabela (manual) | Molde (foto 08) | Usado no v1 | Origem |
|---|---|---|---|---|
| Extensão X da base (`altura_total`) | 15 | perfil 13,5 | **15,0** | medida |
| Extrusão Z (`largura_total`) | 10 | — (foto 05: ~10) | **10,0** | medida |
| Altura do gancho baixo (`profundidade`) | 10 | 10,5 | **10,5** | molde |
| Altura do gancho alto | — | 12,0 | **12,0** | molde |
| Diferença entre ganchos | — | 1,47 | **1,47** | molde |
| Vão no canal inferior, y = 4,5 (`espacamento_hastes`) | 3 | 2,68 | **2,68** | molde |
| Vão no bolsão de travamento, y = 7,5 (`abertura_travamento`) | 5 | 4,20 | **4,20** | molde |
| Largura externa da ponta de cada gancho (`largura_haste`) | 3 | 3,8 / 3,9 | **3,8 / 3,9** | molde |
| Espessura da parede | — | contato 0,83–0,96 | **1,0** | estimada |
| Base de colagem | — | — | **1,5** | projeto |

**Interpretação dos 5 mm.** Acima do ressalto esquerdo, o canal entre os ganchos se alarga
para formar um **bolsão**: é ali que a nervura da estrutura (foto 06) fica retida. Interpretei a
"abertura na região de travamento" como esse vão. O molde mostra 4,2 mm. A diferença para 5 mm
pode vir da tinta (que estreita vãos) ou da medição manual com a peça flexível.

**Por que o padrão segue o molde:** a fidelidade ao molde é a prioridade 1, e ele foi medido com
régua calibrada (incerteza de cerca de ±0,1 mm). Para impor os valores da tabela basta passar,
por exemplo, `Parametros(profundidade=10, espacamento_hastes=3, abertura_travamento=5)`.
O modelo resolve as duas aberturas juntas (Newton 2×2), e essa combinação foi testada: sólido
válido, canal 3,000 e bolsão 5,000.

## 4. Decisões de projeto

- **Base de colagem** de 15 × 10 × 1,5 mm (paramétrica), com cantos arredondados (r = 0,5) e
  concordâncias de r = 0,45 nas junções das pernas (cantos internos sem aresta viva).
  A face de colagem é a de baixo (Y = −1,5).
- **Nervura sob o U.** No molde, o fundo do U fica a apenas 0,35 mm da borda do papel, e a tinta
  chega até ela: o U encostava na base original. Uma fenda de 0,35 mm não imprime e viraria uma
  solda parcial e frágil. Por isso o U é apoiado na base por uma nervura de 1,6 mm com concordâncias
  (`unir_U_base`). As pernas e as pontas continuam livres para fletir.
- **Parede de 1,0 mm**, em vez dos ~0,9 mm estimados: dá exatamente 2 perímetros de 0,5 mm,
  sem preenchimento entre eles. Não engrossei mais que isso para não enrijecer o encaixe.
- **Deformação estimada** (perna como viga engastada): 1 % para 0,5 mm de flecha na ponta e
  2 % para 1 mm. O PETG escoa por volta de 4–5 %, então a margem é boa para encaixes repetidos.

## 5. Impressão (PETG)

- **Orientação:** face Z = 0 na mesa, com o perfil deitado e a extrusão na vertical.
  As dobras ficam dentro de cada camada, de modo que a flexão não abre a adesão entre camadas.
  Não há balanços nem suportes.
- Bico de 0,4 mm com **largura de linha de 0,5 mm**, 2 perímetros e preenchimento de 100 %
  (a peça é quase toda perímetro). Camada de 0,15–0,2 mm.
- Bico a 235–245 °C, mesa a 75–85 °C, ventilação de 30–50 %. Altura de 10 mm e massa de cerca
  de 0,9 g. Imprima 2 ou 3 cópias de uma vez (ajuda no resfriamento entre camadas).
- **Colagem:** lixe levemente a base e a tampa. Use cianoacrilato com primer para poliolefinas
  (a tampa costuma ser de PP/ABS) ou epóxi bicomponente. Posicione com os ganchos no mesmo
  sentido do original: o gancho mais alto fica do lado que estava mais alto na foto 01.

## 6. Ajustes após a primeira impressão

| Sintoma | Parâmetro |
|---|---|
| Não entra / exige muita força | `folga_encaixe` = 0,1–0,3, ou `espessura_parede` = 0,9 |
| Entra mas não segura | `abertura_travamento` menor (fecha o bolsão), ou `espessura_parede` = 1,1 |
| Ganchos altos demais (a base de 1,5 mm eleva a peça) | `rebaixo_perfil` = 0,5–1,0, ou `espessura_base` menor |
| Não alinha com a janela da estrutura | `espacamento_hastes` / `inclinacao_global_graus` |
| Gancho alto bate antes de travar | `diferenca_altura_ganchos` |
| Rachou na raiz das pernas | `raio_juncao_base` = 0,6, e confira a temperatura (adesão entre camadas) |

**Incerteza principal: altura da base.** Não sei se Y = 0 do molde (a borda do papel) era a
superfície da tampa ou o topo de uma base própria da peça original. Na foto 01 há indício de uma
base fina. Se, na prova, os ganchos ficarem altos em relação à janela, use `rebaixo_perfil`.

## 7. Regenerar

```bash
conda create -n cad -c conda-forge python=3.11 cadquery trimesh scipy shapely scikit-image opencv pillow
python trava_ar_condicionado_v1.py .                 # só STEP + STL
python tools/validar_e_renderizar.py .               # STEP, STL, validação e prévias
python tools/comparacao_molde.py referencias/foto08_molde_regua.jpeg comparacao_molde.png
# refazer o ajuste do perfil ao molde:
python tools/extrair_molde.py referencias/foto08_molde_regua.jpeg referencias/molde_linha_media_mm.npy
python tools/ajuste_molde.py referencias/molde_linha_media_mm.npy ajuste.json
```

Validação feita com OpenCascade (via CadQuery) e Trimesh. O FreeCAD não estava disponível no
ambiente de geração. Nota técnica: o cálculo de volume padrão do OpenCascade dá valores errados
para extrusões de B-spline. Por isso o volume relatado vem da malha (712,9 mm³), que confere com
área da seção × 10 mm (712,9 mm³).
