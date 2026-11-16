"""
Trava plástica do acabamento frontal de ar-condicionado — reprodução para FDM (PETG).

Modelo CadQuery paramétrico, v1.

Geometria
---------
A peça original é um PERFIL EXTRUDADO de parede fina: uma lâmina de ~0,9 mm
dobrada em serpentina, formando dois grampos (ganchos) flexíveis com pontas
arredondadas, ligados por um U central. Cada gancho é oco (fenda interna) para
poder fechar elasticamente durante o encaixe.

Sistema de eixos (mm):
  X  -> atravessa os dois ganchos (no aparelho: "altura" da trava, ~15 mm)
  Y  -> saliência a partir da tampa (no aparelho: "profundidade", ~10 mm)
        Y = 0 é a face de topo da base de colagem; a base fica em Y < 0.
  Z  -> direção de extrusão (no aparelho: "largura", 10 mm)

O perfil (plano XY) foi reconstruído do molde de tinta (foto 08, régua
12,94 px/mm) ajustando os parâmetros de PERFIL abaixo por mínimos quadrados
sobre a linha média da faixa de contato da tinta. Ver README.md.

Impressão recomendada: deitar com a face Z=0 na mesa (perfil no plano da mesa,
extrusão na vertical). Assim as dobras dos ganchos ficam DENTRO de cada camada
(flexão sem tensionar a adesão entre camadas) e não há balanços: sem suportes.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import cadquery as cq
import numpy as np


# --------------------------------------------------------------------------
# PARÂMETROS PRINCIPAIS (mm)
# --------------------------------------------------------------------------
@dataclass
class Parametros:
    # Convenção: None = usar o valor medido no MOLDE (prioridade de fidelidade).
    # Entre colchetes, o valor da medição manual da tabela, para quem quiser impor.
    #
    # --- medidas principais ---
    altura_total: float = 15.0        # [15] MEDIDA. Comprimento da base em X (perfil do molde = 13,5)
    largura_total: float = 10.0       # [10] MEDIDA. Extrusão em Z (foto 05 confirma ~10 mm)
    profundidade: float | None = None # [10] altura externa do gancho BAIXO acima do topo da base. Molde: 10,5
    espacamento_hastes: float | None = None   # [3] vão livre entre ganchos no canal inferior (y=4,5). Molde: 2,7
    abertura_travamento: float | None = None  # [5] vão livre no bolsão acima do ressalto (y=7,5). Molde: 4,3
    largura_haste: float = 3.0        # [3] referência apenas. Molde: ~3,8 mm externos na ponta, parede 1,0
                                      # + fenda 1,8. NÃO comanda a geometria (ver README).
    espessura_base: float = 1.5       # base de colagem, abaixo de Y=0
    base_embutida: bool = False       # True = base DENTRO da altura do perfil (Y de 0 a espessura_base),
                                      # sem aumentar a altura; largura da base = largura do perfil.
    rebaixo_perfil: float = 0.0       # afunda o perfil na base (abaixa os ganchos sem mudar a base)
    fracao_preenchida: float = 0.5    # parte do comprimento Z com ganchos maciços, como na original:
                                      # 0 = toda oca, 0,5 = metade maciça (Z de 0 a 5) e metade oca, 1 = maciça.
                                      # A metade maciça fica em Z=0 (lado da mesa): as fendas não precisam de ponte.
    unir_U_base: bool = True          # o fundo do U fica a ~0,35 mm da base no molde: une com nervura
    largura_nervura_U: float = 1.6    # largura (X) da nervura que apoia o fundo do U na base

    # --- parede flexível ---
    espessura_parede: float = 1.0     # ESTIMADA. Contato no molde 0,83–0,96 mm; 1,0 = 2 perímetros de 0,5 mm

    # --- ajustes globais / tolerâncias ---
    diferenca_altura_ganchos: float | None = None  # gancho direito mais alto. Molde: 1,47
    inclinacao_global_graus: float = -1.4 # cisalhamento do perfil (+ inclina as pontas para +X).
                                      # -1,4 = média de 3 carimbos (papel 0; cartão A -2,9; B -1,4)
    escala_x: float = 1.018           # largura do perfil em X. 1,018 = média dos 3 carimbos
                                      # (papel 1,000; cartão A 1,026; B 1,027)
    folga_encaixe: float = 0.0        # >0 estreita cada gancho na ponta (pernas externas para dentro).
                                      # Use 0,1–0,3 se o encaixe ficar duro demais.
    raio_juncao_base: float = 0.45    # concordância pernas/base (cantos internos)
    raio_cantos_base: float = 0.5     # arredondamento dos cantos externos da base (vista XY)
    raio_min_interno: float = 0.4     # raio mínimo nas faces côncavas das dobras (anti-concentração de tensão)
    y_canal: float = 4.5              # altura (molde) onde se mede espacamento_hastes
    y_bolsao: float = 7.5             # altura (molde) onde se mede abertura_travamento

    # --- perfil reconstruído do molde (linha média da parede, mm) ---
    perfil: dict = field(default_factory=lambda: dict(PERFIL_MOLDE))


# Valores obtidos pelo ajuste ao molde (tools/ajuste_molde.py). Coordenadas da
# LINHA MÉDIA da parede, Y medido a partir da borda do papel (= topo da base).
PERFIL_MOLDE = {
    # gancho esquerdo (o mais baixo)
    "E_pe_x": 1.05,            # pé da perna externa em Y=0
    "E_ext_topo_x": -0.88,     # perna externa no início da ponta
    "E_ext_arco": -0.16,       # arqueamento da perna externa (+ = para +X)
    "E_topo_y": 8.77,          # altura onde começa a ponta arredondada
    "E_ponta_semi_larg": 1.40, # meia-largura da ponta (centro a centro das pernas / 2)
    "E_ponta_alt": 1.23,       # altura da semi-elipse da ponta
    "E_int_base_x": 3.76,      # perna interna onde começa o U
    "E_int_arco": -0.33,
    "E_ressalto": -1.63,        # degrau lateral do ressalto (perfil em "S")
    "E_ressalto_y": 6.06,      # altura do ressalto
    "E_ressalto_larg": 0.66,   # meia-extensão vertical do ressalto
    # U central
    "U_inicio_y": 1.90,        # altura onde as pernas internas viram o U
    "U_prof": 1.05,            # profundidade da semi-elipse do U
    # gancho direito (o mais alto)
    "D_int_base_x": 7.05,
    "D_int_topo_x": 6.24,
    "D_int_arco": 0.70,
    "D_ressalto": 1.10,
    "D_ressalto_y": 7.40,
    "D_ressalto_larg": 0.93,
    "D_topo_y": 10.34,
    "D_ponta_semi_larg": 1.43,
    "D_ponta_alt": 1.13,
    "D_ext_arco": 0.03,
    "D_pe_x": 11.61,
}

# --------------------------------------------------------------------------
# GERAÇÃO DA LINHA MÉDIA
# --------------------------------------------------------------------------
def _smooth(u):
    return 0.5 * (1.0 + np.tanh(u))


def _perna(y0, x0, y1, x1, arco, ressalto=0.0, yr=0.0, wr=1.0, n=40):
    """Perna como função x(y): reta + arqueamento senoidal + degrau suave (ressalto)."""
    y = np.linspace(y0, y1, n)
    t = (y - y0) / (y1 - y0)
    x = x0 + (x1 - x0) * t + arco * np.sin(math.pi * t)
    if ressalto:
        s = _smooth((y - yr) / wr)
        s0, s1 = _smooth((y0 - yr) / wr), _smooth((y1 - yr) / wr)
        x = x + ressalto * (s - (s0 + (s1 - s0) * t))
    return np.c_[x, y]


def _semi_elipse(xa, xb, yb, h, n=30, para_baixo=False):
    th = np.linspace(math.pi, 0.0, n) if xa < xb else np.linspace(0.0, math.pi, n)
    xc, a = 0.5 * (xa + xb), 0.5 * abs(xb - xa)
    s = -1.0 if para_baixo else 1.0
    return np.c_[xc + a * np.cos(th), yb + s * h * np.sin(th)]


def linha_media_molde(p: dict, y_pe=-0.9) -> np.ndarray:
    """Linha média no referencial do molde (sem escalas). Do pé esquerdo ao pé direito."""
    Ei_topo = p["E_ext_topo_x"] + 2 * p["E_ponta_semi_larg"]
    De_topo = p["D_int_topo_x"] + 2 * p["D_ponta_semi_larg"]
    # gancho esquerdo
    pe_e = _perna(0.0, p["E_pe_x"], p["E_topo_y"], p["E_ext_topo_x"], p["E_ext_arco"])
    pe_e = np.vstack([[p["E_pe_x"], y_pe], pe_e])  # prolonga o pé para dentro da base
    top_e = _semi_elipse(p["E_ext_topo_x"], Ei_topo, p["E_topo_y"], p["E_ponta_alt"])
    pi_e = _perna(p["E_topo_y"], Ei_topo, p["U_inicio_y"], p["E_int_base_x"], p["E_int_arco"],
                  p["E_ressalto"], p["E_ressalto_y"], p["E_ressalto_larg"])
    u = _semi_elipse(p["E_int_base_x"], p["D_int_base_x"], p["U_inicio_y"], p["U_prof"], para_baixo=True)
    pi_d = _perna(p["U_inicio_y"], p["D_int_base_x"], p["D_topo_y"], p["D_int_topo_x"], p["D_int_arco"],
                  p["D_ressalto"], p["D_ressalto_y"], p["D_ressalto_larg"])
    top_d = _semi_elipse(p["D_int_topo_x"], De_topo, p["D_topo_y"], p["D_ponta_alt"])
    pe_d = _perna(p["D_topo_y"], De_topo, 0.0, p["D_pe_x"], p["D_ext_arco"])
    pe_d = np.vstack([pe_d, [p["D_pe_x"], y_pe]])
    partes = [pe_e, top_e[1:], pi_e[1:], u[1:], pi_d[1:], top_d[1:], pe_d[1:]]
    return np.vstack(partes)


def _reamostrar(pts, passo=0.12):
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
    s = np.linspace(0, d[-1], max(8, int(d[-1] / passo)))
    return np.c_[np.interp(s, d, pts[:, 0]), np.interp(s, d, pts[:, 1])]


def _suavizar(pts, it=3):
    q = pts.copy()
    for _ in range(it):
        q[1:-1] = 0.25 * q[:-2] + 0.5 * q[1:-1] + 0.25 * q[2:]
    return q


def raio_curvatura(c):
    d1 = np.gradient(c, axis=0); d2 = np.gradient(d1, axis=0)
    k = np.abs(d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0]) / np.linalg.norm(d1, axis=1) ** 3
    return 1.0 / np.maximum(k, 1e-9)


def _suavizar_taubin(pts, r_min, max_it=2000, lam=0.5, mu=-0.53):
    """Suavização λ|μ (Taubin): remove quebras de tangente sem encolher o perfil.
    Itera até o raio mínimo da linha média >= r_min. Extremidades fixas."""
    q = pts.copy()
    for _ in range(max_it):
        if raio_curvatura(q)[3:-3].min() >= r_min:
            break
        for f in (lam, mu):
            lap = 0.5 * (q[:-2] + q[2:]) - q[1:-1]
            q[1:-1] += f * lap
        q = _reamostrar(q, 0.12)
    return q


def altura_ganchos_molde(p: dict, esp: float = 0.0):
    """Altura externa do topo de cada gancho (esquerdo, direito) no referencial do molde."""
    return (p["E_topo_y"] + p["E_ponta_alt"] + esp / 2, p["D_topo_y"] + p["D_ponta_alt"] + esp / 2)


def _x_pernas_internas(p: dict, y: float):
    """x da linha média das pernas internas (esquerda, direita) na altura y."""
    Ei_topo = p["E_ext_topo_x"] + 2 * p["E_ponta_semi_larg"]
    pe = _perna(p["E_topo_y"], Ei_topo, p["U_inicio_y"], p["E_int_base_x"], p["E_int_arco"],
                p["E_ressalto"], p["E_ressalto_y"], p["E_ressalto_larg"], n=600)[::-1]
    pd = _perna(p["U_inicio_y"], p["D_int_base_x"], p["D_topo_y"], p["D_int_topo_x"], p["D_int_arco"],
                p["D_ressalto"], p["D_ressalto_y"], p["D_ressalto_larg"], n=600)
    return np.interp(y, pe[:, 1], pe[:, 0]), np.interp(y, pd[:, 1], pd[:, 0])


def vao_entre_ganchos(p: dict, y: float, esp: float) -> float:
    """Vão LIVRE (face a face, na horizontal) entre os ganchos na altura y."""
    xe, xd = _x_pernas_internas(p, y)
    return xd - xe - esp


def perfil_ajustado(P: "Parametros") -> dict:
    """Aplica ao perfil do molde os alvos dos parâmetros principais (quando não são None)."""
    p = dict(P.perfil)
    esp = P.espessura_parede
    # 1) diferença de altura entre os ganchos: sobe/desce a ponta direita
    if P.diferenca_altura_ganchos is not None:
        hE, hD = altura_ganchos_molde(p)
        dy = P.diferenca_altura_ganchos - (hD - hE)
        frac = (p["D_ressalto_y"] - p["U_inicio_y"]) / (p["D_topo_y"] - p["U_inicio_y"])
        p["D_topo_y"] += dy
        p["D_ressalto_y"] += dy * frac
    # 2+3) canal inferior e bolsão de travamento. Variáveis: translação X do gancho direito
    #      (o U acompanha) e degrau do ressalto esquerdo. Acoplados -> Newton 2x2 amortecido.
    canal_alvo = P.espacamento_hastes
    if canal_alvo is None and P.abertura_travamento is not None:
        canal_alvo = vao_entre_ganchos(p, P.y_canal, esp)  # mantém o canal do molde
    alvos = [(P.y_canal, canal_alvo), (P.y_bolsao, P.abertura_travamento)]
    ativos = [i for i, (_, alvo) in enumerate(alvos) if alvo is not None]
    if ativos:
        def aplicar(v):
            q = dict(p)
            for k in ("D_int_base_x", "D_int_topo_x", "D_pe_x"):
                q[k] += v[0]
            q["E_ressalto"] = p["E_ressalto"] + v[1]
            return q
        def erro(v):
            q = aplicar(v)
            return np.array([vao_entre_ganchos(q, alvos[i][0], esp) - alvos[i][1] for i in ativos])
        # só o canal -> só translação; só o bolsão -> só ressalto; ambos -> as duas variáveis
        livres = [0] if ativos == [0] else [1] if ativos == [1] else [0, 1]
        v = np.zeros(2)
        lim = np.array([[-3.0, 3.0], [-2.5, 2.5]])  # faixa física (mm)
        for _ in range(40):
            e = erro(v)
            if np.abs(e).max() < 1e-4:
                break
            J = np.zeros((len(ativos), len(livres)))
            for j, k in enumerate(livres):
                dv = np.zeros(2); dv[k] = 1e-3
                J[:, j] = (erro(v + dv) - e) / 1e-3
            passo = np.linalg.lstsq(J, -e, rcond=None)[0]
            passo = np.clip(passo, -0.5, 0.5)  # amortecimento
            for j, k in enumerate(livres):
                v[k] = np.clip(v[k] + passo[j], *lim[k])
        if np.abs(erro(v)).max() > 0.01:
            print("aviso: canal/bolsão pedidos não são atingíveis dentro dos limites físicos;"
                  " erro residual (mm):", np.round(erro(v), 3))
        p = aplicar(v)
    # 4) folga de encaixe: estreita a ponta de cada gancho pelo lado externo
    if P.folga_encaixe:
        f = P.folga_encaixe
        p["E_ext_topo_x"] += f
        p["E_ponta_semi_larg"] -= f / 2
        p["D_ponta_semi_larg"] -= f / 2
    return p


def linha_media(P: "Parametros") -> np.ndarray:
    """Linha média final (referencial da peça: Y=0 no topo da base)."""
    p = perfil_ajustado(P)
    pts = linha_media_molde(p)
    # 5) escala vertical para a profundidade pedida (altura externa do gancho baixo)
    if P.profundidade is not None:
        sy = P.profundidade / altura_ganchos_molde(p, P.espessura_parede)[0]
        pts[:, 1] *= sy
    # 6) rebaixo do perfil na base
    pts[:, 1] -= P.rebaixo_perfil
    # 7) escala em X em torno do centro do perfil
    xc = 0.5 * (pts[:, 0].min() + pts[:, 0].max())
    pts[:, 0] = xc + (pts[:, 0] - xc) * P.escala_x
    # 8) cisalhamento global
    k = math.tan(math.radians(P.inclinacao_global_graus))
    pts[:, 0] += k * np.clip(pts[:, 1], 0, None)
    c = _suavizar(_reamostrar(pts))
    return _suavizar_taubin(c, P.raio_min_interno + P.espessura_parede / 2)


# --------------------------------------------------------------------------
# SÓLIDO
# --------------------------------------------------------------------------
def _offset(pts, d):
    t = np.gradient(pts, axis=0)
    t /= np.linalg.norm(t, axis=1)[:, None]
    n = np.c_[-t[:, 1], t[:, 0]]
    return pts + d * n


def _spline(pts, tol=0.004):
    """B-spline aproximada (tolerância em mm): poucos polos, superfície limpa no STEP."""
    return cq.Edge.makeSplineApprox([cq.Vector(float(x), float(y), 0) for x, y in pts],
                                    tol=tol, minDeg=3, maxDeg=6, smoothing=None)


def perfil_parede(P: Parametros):
    """Face 2D da lâmina (parede) no plano XY."""
    c = linha_media(P)
    t2 = P.espessura_parede / 2
    a, b = _offset(c, +t2), _offset(c, -t2)
    ea, eb = _spline(a), _spline(b[::-1])
    l1 = cq.Edge.makeLine(cq.Vector(*a[-1], 0), cq.Vector(*b[-1], 0))
    l2 = cq.Edge.makeLine(cq.Vector(*b[0], 0), cq.Vector(*a[0], 0))
    w = cq.Wire.assembleEdges([ea, l1, eb, l2])
    return cq.Face.makeFromWires(w), c


def construir(P: Parametros | None = None) -> cq.Workplane:
    P = P or Parametros()
    face, c = perfil_parede(P)
    parede = cq.Workplane("XY").add(cq.Solid.extrudeLinear(face, cq.Vector(0, 0, P.largura_total)))
    t2 = P.espessura_parede / 2
    # base de colagem centrada sob o perfil
    xmin, xmax = c[:, 0].min() - t2, c[:, 0].max() + t2
    xc = 0.5 * (xmin + xmax)
    if P.base_embutida:
        L = xmax - xmin                       # base rente ao perfil: não aumenta a largura
        y_base = P.espessura_base             # topo da base (a base vai de Y=0 a espessura_base)
    else:
        L = max(P.altura_total, xmax - xmin + 0.6)
        y_base = 0.0
    base = (cq.Workplane("XY").center(xc, y_base - P.espessura_base / 2)
            .rect(L, P.espessura_base).extrude(P.largura_total))
    if P.raio_cantos_base > 0:
        base = base.edges("|Z").fillet(min(P.raio_cantos_base, P.espessura_base / 2 - 0.05))
    corpo = base.union(parede, clean=True)
    if P.base_embutida:  # corta os pés que desceriam abaixo da face de colagem (Y < 0)
        corte = cq.Workplane("XY").center(xc, 50).rect(L + 20, 100).extrude(P.largura_total)
        corpo = corpo.intersect(corte)
    # nervura sob o fundo do U (evita fenda < 0,4 mm, impossível de imprimir)
    if P.unir_U_base:
        # ponto mais baixo do U = mínimo de y entre as pernas internas
        mask = (c[:, 0] > c[:, 0].min() + 2.5) & (c[:, 0] < c[:, 0].max() - 2.5)
        iu = np.where(mask)[0][np.argmin(c[mask, 1])]
        xu, yu = c[iu]
        if yu - t2 > 0.0:
            nerv = (cq.Workplane("XY").center(xu, (yu) / 2)
                    .rect(P.largura_nervura_U, yu).extrude(P.largura_total))
            corpo = corpo.union(nerv, clean=True)
    # concordâncias: arestas ao longo de Z exatamente no topo da base (junções côncavas)
    if P.raio_juncao_base > 0:
        xa, xb = xc - L / 2 + P.raio_cantos_base + 0.2, xc + L / 2 - P.raio_cantos_base - 0.2
        xs = sorted(e.Center().x for e in corpo.edges().vals()
                    if abs(e.Center().y - y_base) < 0.02 and abs(e.Length() - P.largura_total) < 1e-3
                    and xa < e.Center().x < xb)
        # uma aresta por vez (a topologia muda a cada fillet); raio reduzido onde não cabe
        for x in xs:
            for r in (P.raio_juncao_base, 0.75 * P.raio_juncao_base, 0.5 * P.raio_juncao_base):
                cand = [e for e in corpo.edges().vals()
                        if abs(e.Center().y - y_base) < 0.02 and abs(e.Center().x - x) < 0.05
                        and abs(e.Length() - P.largura_total) < 1e-3]
                try:
                    novo = corpo.newObject(cand[:1]).fillet(r)
                    if novo.val().isValid():
                        corpo = novo
                        break
                except Exception:
                    pass
            else:
                print(f"aviso: concordância em x={x:.2f} não aplicada")
    if P.fracao_preenchida > 0:
        # A peça é um prisma: o trecho maciço é o contorno externo da seção (sem as fendas
        # internas dos ganchos) extrudado de Z=0 até a fração pedida, unido ao corpo oco.
        sec = corpo.section(P.largura_total / 2).faces().val()
        face = cq.Face.makeFromWires(sec.outerWire())
        face = face.translate(cq.Vector(0, 0, -face.Center().z))
        zf = min(P.fracao_preenchida, 1.0) * P.largura_total
        macico = cq.Workplane("XY").add(cq.Solid.extrudeLinear(face, cq.Vector(0, 0, zf)))
        corpo = macico if zf >= P.largura_total else corpo.union(macico, clean=True)
    return corpo


if __name__ == "__main__":
    import sys
    from pathlib import Path
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out.mkdir(parents=True, exist_ok=True)
    m = construir()
    cq.exporters.export(m, str(out / "trava_ar_condicionado_v1.step"))
    cq.exporters.export(m, str(out / "trava_ar_condicionado_v1.stl"), tolerance=0.01, angularTolerance=0.1)
    print("exportado em", out.resolve())
