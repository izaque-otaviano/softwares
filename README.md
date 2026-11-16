# Recorte

App leve de barra de menus para macOS **10.14 (Mojave) ou superior**: tira print de qualquer parte da tela e permite marcar com setas, retângulos, círculos, destaques, caneta e texto.

## Como usar

1. Abra o Recorte: aparece um ícone na barra de menus.
2. Pressione o atalho (padrão **⇧⌘2**), arraste para selecionar a área (Espaço = capturar janela, Esc = cancelar).
3. Marque a imagem com a paleta flutuante, depois clique em **Concluído** (copia para a área de transferência e salva na pasta escolhida), **Copiar** ou **Salvar…**.

Atalhos no editor: `A` seta · `R` retângulo · `O` círculo · `H` destacar · `P` caneta · `T` texto · `⇧` linhas retas/formas perfeitas · `⌘Z` desfazer · `⌘C` copiar · `⌘S` salvar · `Esc` fechar.

O atalho global e a pasta de destino são definidos em **Preferências…** (menu do ícone).

## Compilar

Num Mac com Xcode ou Command Line Tools (`xcode-select --install`):

```bash
./build.sh
```

Gera `build/Recorte.dmg`. O GitHub Actions (`.github/workflows/build.yml`) faz o mesmo a cada push.

## Primeira abertura

O app não é notarizado pela Apple. Na primeira vez, clique com o botão direito em **Recorte.app → Abrir → Abrir**.
