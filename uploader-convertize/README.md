# Uploader Convertize — Windows

## Versão 2.2 — clientes em abas

Pasta compartilhada, até três envios simultâneos, fila de espera, credenciais apenas em memória,
histórico e pausa independentes. Consulte `GUIA-2.2.txt`. O código também inclui o build Mac
em `Uploader.spec`. Os registros de build 2.1 abaixo permanecem como histórico.

## Pacotes gerados

Os três pacotes foram compilados no [build 34599375874](https://github.com/izaqueotaviano/uploader-convertize/actions/runs/34599375874): moderno x64, legado x64 e legado x86. Em cada ambiente passaram os 12 testes da lógica, o teste de interface e o autoteste do executável empacotado. Os artefatos do build contêm os ZIPs com os executáveis.

Extraia o ZIP inteiro e abra `Uploader Convertize.exe`. Não mova o EXE para fora da pasta com suas DLLs. Os testes foram executados no Windows Server 2022 do GitHub Actions; não equivalem a testes em Windows 7/8.1, que continuam experimentais. Não houve upload real para a API.

As notas abaixo registram a preparação original e as instruções de manutenção. A indisponibilidade local mencionada foi resolvida usando o GitHub Actions.

Dois perfis preservam os recursos da versão 2.1: progresso, fila persistente, pausa/retomada, linhas verdes e bloqueio de suspensão.

- Moderno: Python 3.13 + Qt 6.11, destinado a Windows 10 1809+ e Windows 11, x64.
- Legado experimental: Python 3.8 + Qt 5.15.2, destinado à avaliação em Windows 7 SP1 e 8.1. É necessário compilar e testar no sistema-alvo. Não há garantia de compatibilidade com todas as edições, atualizações e arquiteturas. O legado usa dependências sem manutenção atual e não deve substituir a edição moderna nas máquinas 10/11.

## Para o mantenedor

Instale Python 3.13 x64 no Windows de compilação moderno, extraia esta pasta e abra `Compilar-Windows-10-11.cmd` com duplo clique. Para o legado, use Python 3.8.10 da arquitetura desejada e `Compilar-Windows-Legado.cmd`, preferencialmente num Windows 7 SP1 de teste com atualizações necessárias do sistema, certificados e runtime Visual C++ compatível.

Os scripts usam a internet para obter as dependências. Eles são para quem gera o pacote, não para os usuários finais. Os executáveis gerados devem ser distribuídos com toda a sua pasta; o usuário abre `Uploader Convertize.exe` por duplo clique, sem Python nem Terminal.

Teste abertura, TLS real contra a API, upload de lote autorizado, pausa, reabertura, retomada, cores e liberação da suspensão em cada Windows antes da entrega. Compilar em Windows recente não prova compatibilidade com o 7. Windows 7 de 32 bits exige dependências e Python de 32 bits. Não desative a validação de certificados para fazer o envio funcionar.

## Estado desta entrega

Adaptação de imports Qt e scripts preparados. Testes da lógica executados no Mac; não houve compilação nem testes em Windows. Não há `.exe` neste diretório. O computador disponível tem Docker Linux, mas não um ambiente Windows configurado, e a autenticação GitHub local está inválida.

## Referências oficiais

- [Qt 6.11 para Windows](https://doc.qt.io/qt-6/windows.html)
- [Python e versões antigas do Windows](https://docs.python.org/3.13/using/windows.html)
- [Distribuição oficial PySide2 5.15.2.1](https://pypi.org/project/PySide2/5.15.2.1/)
- [PyInstaller: construir separadamente em cada sistema](https://pyinstaller.org/en/v4.10/usage.html)
