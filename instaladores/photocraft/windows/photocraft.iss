; Instalador .exe do PhotoCraft para Windows (Inno Setup 6).
;
; Simples como no Mac: Boas-vindas -> Opções -> Instalando -> Pronto. Instala só para o usuário
; atual por padrão (sem pedir senha de administrador); para todos os usuários, use /ALLUSERS.
; Idioma automático (português do Brasil ou inglês).
;
; Compilar (feito pelo workflow .github/workflows/photocraft-instaladores.yml):
;   ISCC.exe /DVersion=0.8.2 /DBinDir=C:\caminho\binarios /DIconFile=C:\caminho\photocraft.ico ^
;            /DDocsDir=C:\caminho\photocraft /O.\saida photocraft.iss
;
; Instalação silenciosa: PhotoCraft-Setup.exe /VERYSILENT /SUPPRESSMSGBOXES [/ALLUSERS]

#ifndef Version
  #define Version "0.0.0"
#endif
#ifndef Arch
  #define Arch "x64"
#endif
#ifndef BinDir
  #error Defina /DBinDir com a pasta que contém photocraft.exe e photocraft-cli.exe
#endif
#ifndef IconFile
  #error Defina /DIconFile com o caminho do photocraft.ico
#endif
#ifndef DocsDir
  #define DocsDir BinDir
#endif

[Setup]
AppId={{3E7A1C55-9D24-4B8E-A6F1-2C5D8B0E7F93}
AppName=PhotoCraft
AppVersion={#Version}
AppVerName=PhotoCraft {#Version}
AppPublisher=ArtCraft Team e colaboradores do PhotoCraft
AppPublisherURL=https://getartcraft.com/apps/photocraft
AppSupportURL=https://github.com/storytold/photocraft/issues
AppUpdatesURL=https://github.com/storytold/photocraft/releases
AppCopyright=Copyright (c) 2026 ArtCraft Team e colaboradores do PhotoCraft
VersionInfoVersion={#Version}
VersionInfoDescription=Instalador do PhotoCraft

; Por usuário por padrão (Programas em %LOCALAPPDATA%); /ALLUSERS instala para todos.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline
DefaultDirName={autopf}\PhotoCraft
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
UninstallDisplayIcon={app}\photocraft.exe
UninstallDisplayName=PhotoCraft

; Saída
OutputBaseFilename=PhotoCraft-{#Version}-Windows-{#Arch}-Setup
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

ShowLanguageDialog=no
LanguageDetectionMethod=uilanguage

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
ptbr.WelcomeTitle=Instalar o PhotoCraft
ptbr.WelcomeText=Edição de imagens rápida, gratuita e open source: camadas, máscaras, texto e arquivos PSD.%n%nO PhotoCraft {#Version} será instalado neste computador. Leva menos de um minuto.%n%nClique em Avançar para continuar.
ptbr.TaskDesktop=Criar um atalho na Área de Trabalho
ptbr.TaskAssoc=Abrir arquivos .pcraft com o PhotoCraft (e mostrá-lo em "Abrir com" para imagens)
ptbr.OptionsTitle=Opções
ptbr.OptionsText=Escolha como você quer abrir o PhotoCraft.
ptbr.OptionsHint=O PhotoCraft sempre aparece no menu Iniciar. Clique em Instalar quando estiver pronto.
ptbr.FinishTitle=Tudo pronto
ptbr.FinishText=O PhotoCraft foi instalado. Você encontra o app no menu Iniciar.
ptbr.Launch=Abrir o PhotoCraft agora
ptbr.DocName=Documento do PhotoCraft
en.WelcomeTitle=Install PhotoCraft
en.WelcomeText=Fast, free and open-source image editing: layers, masks, type and PSD files.%n%nPhotoCraft {#Version} will be installed on this computer. It takes less than a minute.%n%nClick Next to continue.
en.TaskDesktop=Create a desktop shortcut
en.TaskAssoc=Open .pcraft files with PhotoCraft (and list it in "Open with" for images)
en.OptionsTitle=Options
en.OptionsText=Choose how you want to open PhotoCraft.
en.OptionsHint=PhotoCraft is always added to the Start menu. Click Install when you're ready.
en.FinishTitle=You're all set
en.FinishText=PhotoCraft is installed. You'll find it in the Start menu.
en.Launch=Open PhotoCraft now
en.DocName=PhotoCraft Document

[Tasks]
Name: "desktopicon"; Description: "{cm:TaskDesktop}"
Name: "assoc"; Description: "{cm:TaskAssoc}"

[Files]
Source: "{#BinDir}\photocraft.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BinDir}\photocraft-cli.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#DocsDir}\LICENSE-MIT"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#DocsDir}\LICENSE-APACHE"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#DocsDir}\NOTICE"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#BinDir}\OFL-*.txt"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{autoprograms}\PhotoCraft"; Filename: "{app}\photocraft.exe"; WorkingDir: "{app}"; AppUserModelID: "ai.storyteller.photocraft"
Name: "{autodesktop}\PhotoCraft"; Filename: "{app}\photocraft.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
; "photocraft" no Executar (Win+R), como o MSI oficial.
Root: HKA; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\photocraft.exe"; ValueType: string; ValueData: "{app}\photocraft.exe"; Flags: uninsdeletekey
; Associação de arquivos (opcional, marcada): .pcraft é do PhotoCraft.
Root: HKA; Subkey: "Software\Classes\.pcraft"; ValueType: string; ValueData: "PhotoCraft.Document"; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\PhotoCraft.Document"; ValueType: string; ValueData: "{cm:DocName}"; Flags: uninsdeletekey; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\PhotoCraft.Document\DefaultIcon"; ValueType: string; ValueData: "{app}\photocraft.exe,0"; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\PhotoCraft.Document\shell\open\command"; ValueType: string; ValueData: """{app}\photocraft.exe"" ""%1"""; Tasks: assoc
; "Abrir com" para imagens, sem tomar o lugar do app padrão.
Root: HKA; Subkey: "Software\Classes\.psd\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.psb\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.png\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.jpg\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.jpeg\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.webp\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.heic\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.heif\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.tif\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.tiff\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.bmp\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.gif\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.ora\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.kra\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.pdn\OpenWithProgids"; ValueType: string; ValueName: "PhotoCraft.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc

[Run]
Filename: "{app}\photocraft.exe"; Description: "{cm:Launch}"; Flags: nowait postinstall skipifsilent

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
