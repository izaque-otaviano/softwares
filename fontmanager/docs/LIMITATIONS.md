# Limitações conhecidas (leia antes de prometer algo)

## Ativação em aplicativos já abertos (Hot Font Activation)
O app registra a fonte no sistema **e** emite a notificação oficial de mudança. Isso é o máximo que as APIs
públicas permitem. **Se um aplicativo de terceiros recarrega a lista de fontes é decisão dele**, e o sistema
não informa isso. Por isso o estado "reconhecida pelo aplicativo" é sempre *não verificável* e a interface
diz "Aguardando atualização do aplicativo", nunca "pronta no Photoshop".

| Aplicativo | Estado desta versão |
|---|---|
| Adobe Photoshop / Illustrator | **Não testado.** Sem o app neste ambiente. Roteiro manual em `TESTING.md`. |
| Figma Desktop | **Não testado.** |
| Microsoft Word | **Não testado.** Versões que cacheiam a lista de fontes podem exigir reinício. |
| Outros | Depende de o app reagir a `WM_FONTCHANGE` (Windows) / à notificação do Core Text (macOS). |

Nenhum processo de terceiros é encerrado, reiniciado ou manipulado.

## Provedores
* **Fontshare — não implementado.** Não há API pública documentada nem licença que autorize cache/instalação
  automatizados; usar endpoints internos do site seria scraping. A arquitetura está pronta (`providers/fontshare.rs`).
  Alternativa: baixar o ZIP no site e instalar o arquivo como fonte local.
* **Bunny Fonts** só serve CSS/WOFF2 (não instala) e não é consultado para listagem.
* **Google Fonts**: o catálogo oficial exige uma chave gratuita (Configurações). Sem ela, o catálogo vem do
  Fontsource. Os arquivos TTF continuam vindo da CSS2 API do Google (comportamento observado e testado ao vivo:
  sem User-Agent de navegador a resposta traz URLs `.ttf`; não é um contrato documentado e pode mudar).
* **Fontsource**: só instala variantes para as quais a API publica `ttf`/`otf`; senão a família usa outra origem
  (ex.: Google) ou aparece como "não instalável". O adaptador **não pôde ser testado ao vivo** neste ambiente
  (host bloqueado): seus testes usam fixtures baseadas no formato documentado, não respostas capturadas.
  O endpoint de eixos variáveis (`axes`) é lido se existir; sem ele o intervalo `wght` é inferido e a UI avisa.
* Prévia de famílias só-Fontsource usa o subset `latin`.

## Sistema
* A verificação cruzada (processo novo) usa PowerShell (Windows), `osascript` JXA (macOS) e `fc-list` (Linux).
* Linux é backend de desenvolvimento/CI (fontconfig); não é alvo de distribuição.
* Fontes variáveis: algumas versões de aplicativos lidam mal com elas; por padrão ativamos instâncias estáticas
  (configurável).
* Coleções TTC/OTC só são lidas na face 0 para validação.
* Instaladores não são assinados/notarizados (macOS exigirá "Abrir mesmo assim"; Windows exibirá SmartScreen).
