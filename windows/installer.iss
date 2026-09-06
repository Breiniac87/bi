; Inno Setup 6 Script for E-Commerce Analytics Dashboard
; Target: Windows 10 / 11 (x64)

#define MyAppName "E-Commerce Analytics Dashboard"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "E-Commerce Analytics"
#define MyAppURL "https://github.com"
#define MyAppExeName "launcher.vbs"

#ifndef SourceDir
  #define SourceDir "..\dist_windows"
#endif

[Setup]
AppId={{D3F95B02-819A-4E38-B79C-1F0A438DFB71}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\ECommerceDashboard
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\release_windows
OutputBaseFilename=E-Commerce-Dashboard-Setup
SetupIconFile=app_icon.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\app_icon.ico

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "app_icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "wscript.exe"; Parameters: """{app}\{#MyAppExeName}"""; IconFilename: "{app}\app_icon.ico"; WorkingDir: "{app}"
Name: "{group}\Остановить сервер"; Filename: "{app}\stop.bat"; IconFilename: "{app}\app_icon.ico"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "wscript.exe"; Parameters: """{app}\{#MyAppExeName}"""; IconFilename: "{app}\app_icon.ico"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "wscript.exe"; Parameters: """{app}\{#MyAppExeName}"""; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: shellexec postinstall skipifsilent nowait

[UninstallDelete]
Type: files; Name: "{app}\*.log"
Type: files; Name: "{app}\server.pid"
Type: files; Name: "{app}\server.port"
