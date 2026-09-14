[Setup]
AppName=E-Commerce Dashboard
AppVersion={#APP_VERSION}
AppPublisher=E-Commerce Dashboard
DefaultDirName={localappdata}\Programs\E-Commerce-Dashboard
DefaultGroupName=E-Commerce Dashboard
OutputDir=..\release_windows
OutputBaseFilename=E-Commerce-Dashboard-Setup-v{#APP_VERSION}
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
SetupIconFile=app_icon.ico
UninstallDisplayIcon={app}\E-Commerce Dashboard.exe
DisableProgramGroupPage=yes

[Files]
Source: "..\dist_windows\E-Commerce-Dashboard-Portable\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\E-Commerce Dashboard"; Filename: "{app}\E-Commerce Dashboard.exe"; WorkingDir: "{app}"
Name: "{userdesktop}\E-Commerce Dashboard"; Filename: "{app}\E-Commerce Dashboard.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\E-Commerce Dashboard.exe"; Description: "Launch E-Commerce Dashboard"; Flags: nowait postinstall skipifsilent
