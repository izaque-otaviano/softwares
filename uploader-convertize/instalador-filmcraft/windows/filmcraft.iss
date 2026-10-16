; Instalador .exe do FilmCraft para Windows (Inno Setup 6).
;
; Simples como no Mac: Boas-vindas -> Opções -> Instalando -> Pronto. Instala só para o usuário
; atual por padrão (sem pedir senha de administrador); para todos os usuários, use /ALLUSERS.
; Idioma automático (português do Brasil ou inglês).
;
; Compilar (feito pelo workflow .github/workflows/filmcraft-instaladores.yml):
;   ISCC.exe /DVersion=0.8.2 /DBinDir=C:\caminho\binarios /DIconFile=C:\caminho\filmcraft.ico ^
;            /DDocsDir=C:\caminho\filmcraft /O.\saida filmcraft.iss
;
; Instalação silenciosa: FilmCraft-Setup.exe /VERYSILENT /SUPPRESSMSGBOXES [/ALLUSERS]

#ifndef Version
  #define Version "0.0.0"
#endif
#ifndef Arch
  #define Arch "x64"
#endif
#ifndef BinDir
  #error Defina /DBinDir com a pasta que contém filmcraft.exe e filmcraft-cli.exe
#endif
#ifndef IconFile
  #error Defina /DIconFile com o caminho do filmcraft.ico
#endif
#ifndef DocsDir
  #define DocsDir BinDir
#endif

[Setup]
AppId={{64631E45-FB34-40CA-9E4E-719F5313E472}
AppName=FilmCraft
AppVersion={#Version}
AppVerName=FilmCraft {#Version}
AppPublisher=ArtCraft Team e colaboradores do FilmCraft
AppPublisherURL=https://getartcraft.com/apps/filmcraft
AppSupportURL=https://github.com/storytold/filmcraft/issues
AppUpdatesURL=https://github.com/storytold/filmcraft/releases
AppCopyright=Copyright (c) 2026 ArtCraft Team e colaboradores do FilmCraft
VersionInfoVersion={#Version}
VersionInfoDescription=Instalador do FilmCraft

; Por usuário por padrão (Programas em %LOCALAPPDATA%); /ALLUSERS instala para todos.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline
DefaultDirName={autopf}\FilmCraft
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
UninstallDisplayIcon={app}\filmcraft.exe
UninstallDisplayName=FilmCraft

; Saída
OutputBaseFilename=FilmCraft-{#Version}-Windows-{#Arch}-Setup
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

ShowLanguageDialog=no
LanguageDetectionMethod=uilanguage

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
ptbr.WelcomeTitle=Instalar o FilmCraft
ptbr.WelcomeText=Edição de vídeo rápida, gratuita e open source: linha do tempo, áudio, títulos e exportação.%n%nO FilmCraft {#Version} será instalado neste computador. Leva menos de um minuto.%n%nClique em Avançar para continuar.
ptbr.TaskDesktop=Criar um atalho na Área de Trabalho
ptbr.TaskAssoc=Abrir arquivos .fcproj com o FilmCraft (e mostrá-lo em "Abrir com" para vídeos)
ptbr.OptionsTitle=Opções
ptbr.OptionsText=Escolha como você quer abrir o FilmCraft.
ptbr.OptionsHint=O FilmCraft sempre aparece no menu Iniciar. Clique em Instalar quando estiver pronto.
ptbr.FinishTitle=Tudo pronto
ptbr.FinishText=O FilmCraft foi instalado. Você encontra o app no menu Iniciar.
ptbr.Launch=Abrir o FilmCraft agora
ptbr.DocName=Projeto do FilmCraft
en.WelcomeTitle=Install FilmCraft
en.WelcomeText=Fast, free and open-source video editing: timeline, audio, titles and export.%n%nFilmCraft {#Version} will be installed on this computer. It takes less than a minute.%n%nClick Next to continue.
en.TaskDesktop=Create a desktop shortcut
en.TaskAssoc=Open .fcproj files with FilmCraft (and list it in "Open with" for videos)
en.OptionsTitle=Options
en.OptionsText=Choose how you want to open FilmCraft.
en.OptionsHint=FilmCraft is always added to the Start menu. Click Install when you're ready.
en.FinishTitle=You're all set
en.FinishText=FilmCraft is installed. You'll find it in the Start menu.
en.Launch=Open FilmCraft now
en.DocName=FilmCraft Project

[Tasks]
Name: "desktopicon"; Description: "{cm:TaskDesktop}"
Name: "assoc"; Description: "{cm:TaskAssoc}"

[Files]
Source: "{#BinDir}\filmcraft.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BinDir}\filmcraft-cli.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#DocsDir}\LICENSE-MIT"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#DocsDir}\LICENSE-APACHE"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#DocsDir}\NOTICE"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#BinDir}\OFL-*.txt"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{autoprograms}\FilmCraft"; Filename: "{app}\filmcraft.exe"; WorkingDir: "{app}"; AppUserModelID: "ai.storyteller.filmcraft"
Name: "{autodesktop}\FilmCraft"; Filename: "{app}\filmcraft.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
; "filmcraft" no Executar (Win+R), como o MSI oficial.
Root: HKA; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\filmcraft.exe"; ValueType: string; ValueData: "{app}\filmcraft.exe"; Flags: uninsdeletekey
; Associação de arquivos (opcional, marcada): .fcproj é do FilmCraft.
Root: HKA; Subkey: "Software\Classes\.fcproj"; ValueType: string; ValueData: "FilmCraft.Project"; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\FilmCraft.Project"; ValueType: string; ValueData: "{cm:DocName}"; Flags: uninsdeletekey; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\FilmCraft.Project\DefaultIcon"; ValueType: string; ValueData: "{app}\filmcraft.exe,0"; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\FilmCraft.Project\shell\open\command"; ValueType: string; ValueData: """{app}\filmcraft.exe"" ""%1"""; Tasks: assoc
; "Abrir com" para vídeos, sem tomar o lugar do app padrão.
Root: HKA; Subkey: "Software\Classes\.mp4\OpenWithProgids"; ValueType: string; ValueName: "FilmCraft.Project"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.m4v\OpenWithProgids"; ValueType: string; ValueName: "FilmCraft.Project"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.mov\OpenWithProgids"; ValueType: string; ValueName: "FilmCraft.Project"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.mkv\OpenWithProgids"; ValueType: string; ValueName: "FilmCraft.Project"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.webm\OpenWithProgids"; ValueType: string; ValueName: "FilmCraft.Project"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.avi\OpenWithProgids"; ValueType: string; ValueName: "FilmCraft.Project"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.mxf\OpenWithProgids"; ValueType: string; ValueName: "FilmCraft.Project"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.mts\OpenWithProgids"; ValueType: string; ValueName: "FilmCraft.Project"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.m2ts\OpenWithProgids"; ValueType: string; ValueName: "FilmCraft.Project"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc

[Run]
Filename: "{app}\filmcraft.exe"; Description: "{cm:Launch}"; Flags: nowait postinstall skipifsilent

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
