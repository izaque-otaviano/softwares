; Instalador .exe do FigCraft para Windows (Inno Setup 6).
;
; Simples como no Mac: Boas-vindas -> Opções -> Instalando -> Pronto. Instala só para o usuário
; atual por padrão (sem pedir senha de administrador); para todos os usuários, use /ALLUSERS.
; Idioma automático (português do Brasil ou inglês).
;
; Compilar (feito pelo workflow .github/workflows/figcraft-instaladores.yml):
;   ISCC.exe /DVersion=0.6.0 /DBinDir=C:\caminho\binarios /DIconFile=C:\caminho\figcraft.ico ^
;            /DDocsDir=C:\caminho\figcraft /O.\saida figcraft.iss
;
; Instalação silenciosa: FigCraft-Setup.exe /VERYSILENT /SUPPRESSMSGBOXES [/ALLUSERS]

#ifndef Version
  #define Version "0.0.0"
#endif
#ifndef Arch
  #define Arch "x64"
#endif
#ifndef BinDir
  #error Defina /DBinDir com a pasta que contém figcraft.exe e figcraft-cli.exe
#endif
#ifndef IconFile
  #error Defina /DIconFile com o caminho do figcraft.ico
#endif
#ifndef DocsDir
  #define DocsDir BinDir
#endif

[Setup]
AppId={{2F9E02FB-14DF-466E-93F5-5AFFFEC53999}
AppName=FigCraft
AppVersion={#Version}
AppVerName=FigCraft {#Version}
AppPublisher=ArtCraft Team e colaboradores do FigCraft
AppPublisherURL=https://getartcraft.com/apps/figcraft
AppSupportURL=https://github.com/storytold/figcraft/issues
AppUpdatesURL=https://github.com/storytold/figcraft/releases
AppCopyright=Copyright (c) 2026 ArtCraft Team e colaboradores do FigCraft
VersionInfoVersion={#Version}
VersionInfoDescription=Instalador do FigCraft

; Por usuário por padrão (Programas em %LOCALAPPDATA%); /ALLUSERS instala para todos.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline
DefaultDirName={autopf}\FigCraft
UsePreviousAppDir=yes
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableWelcomePage=no
AlwaysShowDirOnReadyPage=no
CloseApplications=yes
RestartApplications=no
ChangesAssociations=yes

#if Arch == "x64"
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
#elif Arch == "arm64"
ArchitecturesAllowed=arm64
ArchitecturesInstallIn64BitMode=arm64
#endif
MinVersion=10.0

; Visual
WizardStyle=modern
WizardSizePercent=110
WizardResizable=no
WizardImageFile=assistente-grande-0.bmp,assistente-grande-1.bmp,assistente-grande-2.bmp,assistente-grande-3.bmp,assistente-grande-4.bmp,assistente-grande-5.bmp,assistente-grande-6.bmp
WizardSmallImageFile=assistente-pequeno-0.bmp,assistente-pequeno-1.bmp,assistente-pequeno-2.bmp,assistente-pequeno-3.bmp,assistente-pequeno-4.bmp,assistente-pequeno-5.bmp,assistente-pequeno-6.bmp
WizardImageStretch=no
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\figcraft.exe
UninstallDisplayName=FigCraft

; Saída
OutputBaseFilename=FigCraft-{#Version}-Windows-{#Arch}-Setup
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

ShowLanguageDialog=no
LanguageDetectionMethod=uilanguage

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
ptbr.WelcomeTitle=Instalar o FigCraft
ptbr.WelcomeText=Design de interfaces rápido, gratuito e open source: frames, auto layout, componentes, variáveis e protótipos.%n%nO FigCraft {#Version} será instalado neste computador. Leva menos de um minuto.%n%nClique em Avançar para continuar.
ptbr.TaskDesktop=Criar um atalho na Área de Trabalho
ptbr.TaskAssoc=Abrir arquivos .figcraft com o FigCraft (e mostrá-lo em "Abrir com" para SVG e imagens)
ptbr.OptionsTitle=Opções
ptbr.OptionsText=Escolha como você quer abrir o FigCraft.
ptbr.OptionsHint=O FigCraft sempre aparece no menu Iniciar. Clique em Instalar quando estiver pronto.
ptbr.FinishTitle=Tudo pronto
ptbr.FinishText=O FigCraft foi instalado. Você encontra o app no menu Iniciar.
ptbr.Launch=Abrir o FigCraft agora
ptbr.DocName=Documento do FigCraft
en.WelcomeTitle=Install FigCraft
en.WelcomeText=Fast, free and open-source interface design: frames, auto layout, components, variables and prototypes.%n%nFigCraft {#Version} will be installed on this computer. It takes less than a minute.%n%nClick Next to continue.
en.TaskDesktop=Create a desktop shortcut
en.TaskAssoc=Open .figcraft files with FigCraft (and list it in "Open with" for SVG and images)
en.OptionsTitle=Options
en.OptionsText=Choose how you want to open FigCraft.
en.OptionsHint=FigCraft is always added to the Start menu. Click Install when you're ready.
en.FinishTitle=You're all set
en.FinishText=FigCraft is installed. You'll find it in the Start menu.
en.Launch=Open FigCraft now
en.DocName=FigCraft Document

[Tasks]
Name: "desktopicon"; Description: "{cm:TaskDesktop}"
Name: "assoc"; Description: "{cm:TaskAssoc}"

[Files]
Source: "{#BinDir}\figcraft.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BinDir}\figcraft-cli.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#DocsDir}\LICENSE-MIT"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#DocsDir}\LICENSE-APACHE"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#DocsDir}\NOTICE"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#BinDir}\OFL-*.txt"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{autoprograms}\FigCraft"; Filename: "{app}\figcraft.exe"; WorkingDir: "{app}"; AppUserModelID: "ai.storyteller.figcraft"
Name: "{autodesktop}\FigCraft"; Filename: "{app}\figcraft.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
; "figcraft" no Executar (Win+R), como o MSI oficial.
Root: HKA; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\figcraft.exe"; ValueType: string; ValueData: "{app}\figcraft.exe"; Flags: uninsdeletekey
; Associação de arquivos (opcional, marcada): .figcraft é do FigCraft, como no MSI oficial.
Root: HKA; Subkey: "Software\Classes\.figcraft"; ValueType: string; ValueData: "FigCraft.Document"; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\FigCraft.Document"; ValueType: string; ValueData: "{cm:DocName}"; Flags: uninsdeletekey; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\FigCraft.Document\DefaultIcon"; ValueType: string; ValueData: "{app}\figcraft.exe,0"; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\FigCraft.Document\shell\open\command"; ValueType: string; ValueData: """{app}\figcraft.exe"" ""%1"""; Tasks: assoc
; "Abrir com" para SVG e imagens, sem tomar o lugar do app padrão (como o MSI oficial).
Root: HKA; Subkey: "Software\Classes\.svg\OpenWithProgids"; ValueType: string; ValueName: "FigCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.png\OpenWithProgids"; ValueType: string; ValueName: "FigCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.jpg\OpenWithProgids"; ValueType: string; ValueName: "FigCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.jpeg\OpenWithProgids"; ValueType: string; ValueName: "FigCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc

[Run]
Filename: "{app}\figcraft.exe"; Description: "{cm:Launch}"; Flags: nowait postinstall skipifsilent

[Code]
procedure CurPageChanged(CurPageID: Integer);
begin
  // Textos curtos e diretos, no tom dos instaladores da Apple.
  case CurPageID of
    wpWelcome:
      begin
        WizardForm.WelcomeLabel1.Caption := CustomMessage('WelcomeTitle');
        WizardForm.WelcomeLabel2.Caption := CustomMessage('WelcomeText');
      end;
    // A tela de opções é a última antes de instalar: o botão diz "Instalar" em vez de "Avançar".
    wpSelectTasks:
      begin
        WizardForm.PageNameLabel.Caption := CustomMessage('OptionsTitle');
        WizardForm.PageDescriptionLabel.Caption := CustomMessage('OptionsText');
        WizardForm.SelectTasksLabel.Caption := CustomMessage('OptionsHint');
        WizardForm.NextButton.Caption := SetupMessage(msgButtonInstall);
      end;
    wpFinished:
      begin
        WizardForm.FinishedHeadingLabel.Caption := CustomMessage('FinishTitle');
        WizardForm.FinishedLabel.Caption := CustomMessage('FinishText');
      end;
  end;
end;
