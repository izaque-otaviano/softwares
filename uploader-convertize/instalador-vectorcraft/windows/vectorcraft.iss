; Instalador .exe do VectorCraft para Windows (Inno Setup 6).
;
; Simples como no Mac: Boas-vindas -> Opções -> Instalando -> Pronto. Instala só para o usuário
; atual por padrão (sem pedir senha de administrador); para todos os usuários, use /ALLUSERS.
; Idioma automático (português do Brasil ou inglês).
;
; Compilar (feito pelo workflow .github/workflows/vectorcraft-instaladores.yml):
;   ISCC.exe /DVersion=0.10.0 /DBinDir=C:\caminho\binarios /DIconFile=C:\caminho\vectorcraft.ico ^
;            /DDocsDir=C:\caminho\vectorcraft /O.\saida vectorcraft.iss
;
; Instalação silenciosa: VectorCraft-Setup.exe /VERYSILENT /SUPPRESSMSGBOXES [/ALLUSERS]

#ifndef Version
  #define Version "0.0.0"
#endif
#ifndef Arch
  #define Arch "x64"
#endif
#ifndef BinDir
  #error Defina /DBinDir com a pasta que contém vectorcraft.exe e vectorcraft-cli.exe
#endif
#ifndef IconFile
  #error Defina /DIconFile com o caminho do vectorcraft.ico
#endif
#ifndef DocsDir
  #define DocsDir BinDir
#endif

[Setup]
AppId={{8B0F4D2A-5C1E-4F7B-9A3D-6E2C1B7A9F40}
AppName=VectorCraft
AppVersion={#Version}
AppVerName=VectorCraft {#Version}
AppPublisher=ArtCraft Team e colaboradores do VectorCraft
AppPublisherURL=https://getartcraft.com/apps/vectorcraft
AppSupportURL=https://github.com/storytold/vectorcraft/issues
AppUpdatesURL=https://github.com/storytold/vectorcraft/releases
AppCopyright=Copyright (c) 2026 ArtCraft Team e colaboradores do VectorCraft
VersionInfoVersion={#Version}
VersionInfoDescription=Instalador do VectorCraft

; Por usuário por padrão (Programas em %LOCALAPPDATA%); /ALLUSERS instala para todos.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline
DefaultDirName={autopf}\VectorCraft
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
UninstallDisplayIcon={app}\vectorcraft.exe
UninstallDisplayName=VectorCraft

; Saída
OutputBaseFilename=VectorCraft-{#Version}-Windows-{#Arch}-Setup
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

ShowLanguageDialog=no
LanguageDetectionMethod=uilanguage

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
ptbr.WelcomeTitle=Instalar o VectorCraft
ptbr.WelcomeText=Ilustração vetorial rápida, gratuita e open source.%n%nO VectorCraft {#Version} será instalado neste computador. Leva menos de um minuto.%n%nClique em Avançar para continuar.
ptbr.TaskDesktop=Criar um atalho na Área de Trabalho
ptbr.TaskAssoc=Abrir arquivos .vectorcraft com o VectorCraft
ptbr.OptionsTitle=Opções
ptbr.OptionsText=Escolha como você quer abrir o VectorCraft.
ptbr.OptionsHint=O VectorCraft sempre aparece no menu Iniciar. Clique em Instalar quando estiver pronto.
ptbr.FinishTitle=Tudo pronto
ptbr.FinishText=O VectorCraft foi instalado. Você encontra o app no menu Iniciar.
ptbr.Launch=Abrir o VectorCraft agora
ptbr.DocName=Documento do VectorCraft
ptbr.TemplateName=Modelo do VectorCraft
en.WelcomeTitle=Install VectorCraft
en.WelcomeText=Fast, free and open-source vector illustration.%n%nVectorCraft {#Version} will be installed on this computer. It takes less than a minute.%n%nClick Next to continue.
en.TaskDesktop=Create a desktop shortcut
en.TaskAssoc=Open .vectorcraft files with VectorCraft
en.OptionsTitle=Options
en.OptionsText=Choose how you want to open VectorCraft.
en.OptionsHint=VectorCraft is always added to the Start menu. Click Install when you're ready.
en.FinishTitle=You're all set
en.FinishText=VectorCraft is installed. You'll find it in the Start menu.
en.Launch=Open VectorCraft now
en.DocName=VectorCraft Document
en.TemplateName=VectorCraft Template

[Tasks]
Name: "desktopicon"; Description: "{cm:TaskDesktop}"
Name: "assoc"; Description: "{cm:TaskAssoc}"

[Files]
Source: "{#BinDir}\vectorcraft.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BinDir}\vectorcraft-cli.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#DocsDir}\LICENSE-MIT"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#DocsDir}\LICENSE-APACHE"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#DocsDir}\NOTICE"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#BinDir}\OFL-*.txt"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{autoprograms}\VectorCraft"; Filename: "{app}\vectorcraft.exe"; WorkingDir: "{app}"; AppUserModelID: "ai.storyteller.vectorcraft"
Name: "{autodesktop}\VectorCraft"; Filename: "{app}\vectorcraft.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
; "vectorcraft" no Executar (Win+R), como o MSI oficial.
Root: HKA; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\vectorcraft.exe"; ValueType: string; ValueData: "{app}\vectorcraft.exe"; Flags: uninsdeletekey
; Associação de arquivos (opcional, marcada).
Root: HKA; Subkey: "Software\Classes\.vectorcraft"; ValueType: string; ValueData: "VectorCraft.Document"; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.vctemplate"; ValueType: string; ValueData: "VectorCraft.Template"; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\VectorCraft.Document"; ValueType: string; ValueData: "{cm:DocName}"; Flags: uninsdeletekey; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\VectorCraft.Document\DefaultIcon"; ValueType: string; ValueData: "{app}\vectorcraft.exe,0"; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\VectorCraft.Document\shell\open\command"; ValueType: string; ValueData: """{app}\vectorcraft.exe"" ""%1"""; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\VectorCraft.Template"; ValueType: string; ValueData: "{cm:TemplateName}"; Flags: uninsdeletekey; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\VectorCraft.Template\DefaultIcon"; ValueType: string; ValueData: "{app}\vectorcraft.exe,0"; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\VectorCraft.Template\shell\open\command"; ValueType: string; ValueData: """{app}\vectorcraft.exe"" ""%1"""; Tasks: assoc
; "Abrir com" para SVG e PDF, sem tomar o lugar do app padrão.
Root: HKA; Subkey: "Software\Classes\.svg\OpenWithProgids"; ValueType: string; ValueName: "VectorCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.pdf\OpenWithProgids"; ValueType: string; ValueName: "VectorCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc

[Run]
Filename: "{app}\vectorcraft.exe"; Description: "{cm:Launch}"; Flags: nowait postinstall skipifsilent

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
