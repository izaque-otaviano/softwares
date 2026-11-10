# Testes

## Automatizados — o que cada um valida de verdade

| Suíte | Onde roda | O que é real | O que NÃO é |
|---|---|---|---|
| `fm-core` unit/integração (`cargo test -p fm-core`) | Linux/Win/mac | SQLite real (arquivo e memória), TTF real (Tiny5), HTTP real para um servidor local, validação/cache/dedup/CSS | provedores usam fixtures de formato documentado |
| `tests/activation.rs` | Linux (fontconfig real); Win/mac usam o backend nativo do runner só nos testes com `Refusing`/provedor falso | fluxo completo catálogo → download → validação → registro → verificação em processo novo → desativação com contagem de referências; fonte pré-existente do usuário intocada | |
| `tests/live.rs` (`-- --ignored`) | com internet | Google CSS2 + gstatic de verdade, TTF baixado e validado | Fontsource/Bunny (bloqueados no ambiente de desenvolvimento) |
| `fm-native/tests/os_integration.rs` (`FM_OS_TESTS=1`) | Linux, **Windows e macOS na CI** | registra/desregistra uma fonte real no SO e confirma em **processo separado**; Windows: chave HKCU | não envolve apps de terceiros |
| Frontend (`npm test`) | Node | lógica pura (URLs, pesos, rótulos de estado) | não há teste de UI automatizado do app Tauri |

O que **foi** e **não foi** executado em cada fase está no resumo da entrega; a CI (`.github/workflows/fontmanager-ci.yml`) é a
fonte de verdade para Windows/macOS.

## Roteiro manual com aplicativos de terceiros (só com os apps instalados)

Pré-requisito: app abrindo um documento com a ferramenta de texto selecionada. Fonte de teste: qualquer
família Google ainda não instalada (ex.: *Tiny5*).

1. Abra o aplicativo **antes** de ativar. Anote a versão do app e do SO.
2. No Font Manager: **Ativar**. Anote as fases exibidas e o resultado de *Sistema → Verificar em processo novo*.
3. No aplicativo (sem reiniciar): procure a fonte na lista. Registre: apareceu imediatamente / após reabrir o
   seletor de fontes / só após reiniciar / não apareceu.
4. **Desativar**; confirme que a fonte some do SO (passo 2) e anote o comportamento do app com um documento aberto que a usava.
5. Repita para Photoshop, Illustrator, Figma Desktop e Word e preencha a tabela de `LIMITATIONS.md` **com o que observou**.
