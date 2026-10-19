# Onde ficam seus trabalhos: salvamento, rascunhos e versões

Este guia é para quem usa o FigCraft. Ele responde: **meu trabalho fica salvo? Onde? Como volto
para uma versão antiga? Como faço backup?**

Resposta curta: **sim, o FigCraft salva sozinho enquanto você trabalha**, e guarda o histórico de
versões dentro do próprio arquivo.

## No computador (macOS, Windows, Linux)

### Arquivos que você já salvou (`.figcraft`)

- O seu trabalho fica **no arquivo `.figcraft` que você escolheu** (por exemplo, em
  `Documentos/Loja.figcraft`). Não existe um "cofre" escondido dentro do programa: o arquivo é seu e
  você pode copiar, mover, enviar por e-mail ou guardar em uma nuvem (Dropbox, iCloud, Google Drive).
- **Salvamento automático (ligado por padrão).** Alguns segundos depois da sua última alteração
  (cerca de 2,5 s parado; no máximo 30 s se você não parar de editar), o FigCraft grava as
  mudanças no próprio arquivo. Você não precisa apertar Salvar. Debaixo do nome do arquivo, no topo
  do painel da esquerda, aparece o estado: **Salvando…**, **Alterações não salvas** (por um instante)
  ou **Salvo**. Se der erro (disco cheio, pasta sem permissão, arquivo aberto em outro programa),
  aparece **Não foi possível salvar**, com o motivo ao passar o mouse, e o FigCraft tenta de novo a
  cada 30 s.
- A gravação é **segura**: o FigCraft escreve num arquivo temporário e só troca o seu arquivo quando
  o novo está completo. Uma queda de energia no meio não estraga o arquivo que você já tinha.
- **Cópia de segurança `.bak`.** Na primeira vez que o salvamento automático grava um arquivo, a
  versão anterior dele é guardada ao lado, como `Loja.figcraft.bak`. Para voltar a ela, renomeie o
  `.bak` para `.figcraft`.
- Para **desligar** o salvamento automático: *Preferências ▸ Salvar arquivos automaticamente*.
  Com ele desligado, o FigCraft volta a pedir para você salvar (Cmd/Ctrl+S) e a avisar de alterações
  não salvas ao fechar.
- **Salvar como…** continua existindo para fazer uma cópia em outro lugar.

### Arquivos novos que ainda não têm nome ou lugar: Rascunhos

- Um arquivo novo (Sem título) que você começou a editar é guardado **automaticamente na pasta de
  rascunhos** do app. Você pode fechar o app, desligar o computador, e o rascunho continua lá.

  | Sistema | Pasta dos rascunhos |
  |---|---|
  | macOS | `~/Library/Application Support/FigCraft/Drafts/` |
  | Windows | `%LOCALAPPDATA%\FigCraft\Drafts\` (por exemplo, `C:\Users\você\AppData\Local\FigCraft\Drafts\`) |
  | Linux | `~/.local/share/FigCraft/Drafts/` (ou `$XDG_DATA_HOME/FigCraft/Drafts/`) |

  Cada rascunho é um arquivo `.figcraft` comum, com o nome do arquivo seguido de um código
  (`Loja-18f3a.figcraft`). Você pode copiá-lo para onde quiser.
- **Como abrir um rascunho:** na **tela inicial** (o ícone de casa, no canto superior esquerdo),
  a seção **Rascunhos** lista os arquivos com a data da última edição, e mostra a pasta onde eles
  ficam. Clique para abrir. Clique com o botão direito para **Excluir rascunho**.
- **Para guardar um rascunho de verdade**, use **Arquivo ▸ Salvar como…** e escolha uma pasta. O
  arquivo vai para lá e o rascunho desaparece da lista. Cmd/Ctrl+S num rascunho também abre o
  *Salvar como…*, para você escolher o lugar.
- Rascunhos sem nenhuma alteração não são criados.

### Se o FigCraft fechar de repente (recuperação)

Além do salvamento automático, o FigCraft mantém **cópias de recuperação** (na pasta `Recovery` da
configuração do app) dos arquivos com alterações ainda não gravadas. Se o app travar ou o computador
desligar, na próxima abertura esses arquivos reabrem como **não salvos**, e o FigCraft avisa.

## Versões (histórico de versões)

O histórico fica **dentro do arquivo `.figcraft`**: se você mandar o arquivo para alguém, as
versões vão junto. Abra por **Arquivo ▸ Mostrar histórico de versões** ou pela **setinha ao lado do
nome do arquivo**, no topo do painel da esquerda.

- **Versões automáticas.** O FigCraft cria um ponto de retorno ("Autosave") quando:
  - passam 30 minutos com alterações não registradas numa versão;
  - você fica **1 minuto parado** depois de editar, se a última versão tem mais de 5 minutos;
  - você **fecha o arquivo** ou **fecha o app**, se algo mudou desde a última versão.

  Guardamos as **20 versões automáticas** mais recentes; as mais antigas saem para dar lugar às novas.
- **Versões com nome nunca são apagadas.** Use **Salvar versão…** (setinha do nome do arquivo, ou o
  botão **+** no histórico) para marcar um momento importante com um título e uma descrição.
  Renomear uma versão automática também a transforma em versão com nome. O limite total é de 100
  versões por arquivo.
- O histórico mostra os dias (**Hoje**, **Ontem**, depois a data), a hora e o autor ("Você", ou o
  nome que você configurou nas preferências). As datas e horas aparecem em UTC.
- **Ver uma versão:** clique nela; ela aparece no canvas, só para leitura, com um aviso. Clique em
  **Versão atual** para sair.
- **Restaurar uma versão:** menu **⋯ ▸ Restaurar esta versão** (ou o botão no aviso). Antes de
  restaurar, o FigCraft **guarda o estado de agora como uma versão**, então dá para voltar atrás:
  restaurar nunca perde trabalho. A restauração vale como um passo de desfazer (Cmd/Ctrl+Z).
- **Duplicar** abre a versão como um arquivo novo, sem mexer no atual.

## Menu da setinha ao lado do nome do arquivo

Mostrar histórico de versões · Salvar versão… · Exportar… · Duplicar · Renomear · Mostrar na pasta
(abre o arquivo no Finder/Explorer; fica cinza se o arquivo ainda não está num lugar escolhido por
você). **Mover para a lixeira** e **Publicar biblioteca** ainda não existem; para apagar um arquivo,
use o gerenciador de arquivos do sistema.

## No navegador (versão web)

A versão web **não tem pasta no seu computador**. Por isso:

- Seu trabalho é guardado **no próprio navegador** (IndexedDB; se não houver, `localStorage`), de
  segundos em segundos depois de cada alteração, com o histórico de versões. Ao **recarregar a
  página**, as abas e o arquivo que estavam abertos voltam.
- Na tela inicial, a seção **Arquivos neste navegador** lista tudo o que está guardado ali. Clique
  para abrir; botão direito para **Baixar uma cópia** ou **Remover deste navegador**.
- **Atenção:** esses arquivos existem **só neste navegador e neste computador**. **Limpar os dados do
  site, usar uma janela anônima/privada, ou trocar de navegador ou de computador** faz o trabalho
  sumir. Para guardar de verdade, **baixe uma cópia**: *Arquivo ▸ Salvar* (ou Cmd/Ctrl+S) baixa o
  arquivo `.figcraft`. Para abri-lo de novo, use *Arquivo ▸ Abrir* e escolha o arquivo.
- Se o navegador **recusar guardar** (armazenamento cheio, janela privada), o FigCraft avisa
  ("Não foi possível salvar", com o motivo) e mantém o trabalho na página: **baixe uma cópia**
  e libere espaço removendo arquivos antigos da lista.
- **Duas abas do mesmo site:** cada aba lembra as suas próprias abas de arquivos. Se você abrir o
  mesmo arquivo nas duas, **a última a gravar vence** (o arquivo nunca fica corrompido, mas a
  alteração da outra aba pode ser sobrescrita).
- Ao fechar a aba de repente, o que você fez nos últimos 1 a 2 segundos pode não ter sido gravado.

## Como fazer backup

1. **Desktop:** copie os arquivos `.figcraft` (e a pasta de rascunhos, na tabela acima) para um disco
   externo ou uma nuvem. Se o arquivo já fica numa pasta sincronizada (Dropbox, iCloud, OneDrive),
   o salvamento automático vai atualizando a cópia na nuvem.
2. **Web:** baixe uma cópia de cada arquivo importante (**Baixar uma cópia**, na tela inicial).
3. Para guardar uma "foto" de um momento sem mexer no arquivo, salve uma **versão com nome**: ela viaja
   dentro do arquivo.
4. Para exportar imagens, PDF ou SVG, use **Arquivo ▸ Exportar…** (isso não substitui o backup do
   `.figcraft`, que guarda camadas, componentes e versões).
