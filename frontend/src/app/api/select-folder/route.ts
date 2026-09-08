import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

function getProjectRoot(): string {
  let curr = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (
      fs.existsSync(path.join(curr, 'sync_local_to_sqlite.py')) ||
      fs.existsSync(path.join(curr, 'data')) ||
      fs.existsSync(path.join(curr, 'node.exe'))
    ) {
      return curr;
    }
    const parent = path.resolve(curr, '..');
    if (parent === curr) break;
    curr = parent;
  }
  return process.cwd();
}

function getConfigPath(): string {
  if (process.env.CONFIG_PATH && fs.existsSync(/*turbopackIgnore: true*/ process.env.CONFIG_PATH)) {
    return process.env.CONFIG_PATH;
  }
  const projectRoot = getProjectRoot();
  const portableCfg = path.join(projectRoot, 'data', 'config.json');
  if (fs.existsSync(/*turbopackIgnore: true*/ portableCfg)) {
    return portableCfg;
  }
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
  if (appData) {
    const winCfg = path.join(appData, 'ECommerceDashboard', 'config.json');
    if (fs.existsSync(/*turbopackIgnore: true*/ winCfg)) return winCfg;
  }
  if (process.env.HOME) {
    const macCfg = path.join(process.env.HOME, 'Library', 'Application Support', 'ECommerceDashboard', 'config.json');
    if (fs.existsSync(/*turbopackIgnore: true*/ macCfg)) return macCfg;
  }
  return path.join(projectRoot, 'config.json');
}

export async function GET() {
  const cfgPath = getConfigPath();
  const projectRoot = getProjectRoot();
  let config = {
    ads_dir: path.join(projectRoot, 'data', 'ads'),
    sales_dir: path.join(projectRoot, 'data', 'sales')
  };

  if (fs.existsSync(/*turbopackIgnore: true*/ cfgPath)) {
    try {
      const raw = fs.readFileSync(/*turbopackIgnore: true*/ cfgPath, 'utf-8');
      config = { ...config, ...JSON.parse(raw) };
    } catch (e) {
      console.error('Ошибка чтения config.json:', e);
    }
  }

  return NextResponse.json({ success: true, config });
}

function getWindowsFolderDialogCmd(title: string, currentPath?: string): string {
  const initialPathLine = currentPath && fs.existsSync(/*turbopackIgnore: true*/ currentPath)
    ? `$dialog.SelectedPath = '${currentPath.replace(/'/g, "''")}';`
    : '';

  const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Выберите папку с отчетами по ${title}"
$dialog.ShowNewFolderButton = $true
$dialog.AutoUpgradeEnabled = $true
${initialPathLine}
$topForm = New-Object System.Windows.Forms.Form
$topForm.TopMost = $true
$topForm.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$result = $dialog.ShowDialog($topForm)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::WriteLine($dialog.SelectedPath)
} else {
  [Console]::WriteLine("__CANCELED__")
}
`;
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
  return `powershell -NoProfile -STA -NonInteractive -EncodedCommand ${encoded}`;
}

function getMacFolderDialogCmd(title: string, currentPath?: string): string {
  const prompt = `Выберите папку с отчетами по ${title}`;
  let defaultLoc = '';
  if (currentPath && fs.existsSync(currentPath)) {
    const escaped = currentPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    defaultLoc = ` default location POSIX file "${escaped}"`;
  }
  return `osascript -e 'try' -e 'set f to choose folder with prompt "${prompt}"${defaultLoc}' -e 'return POSIX path of f' -e 'on error' -e 'return "__CANCELED__"' -e 'end try'`;
}

function getFolderDialogCmd(title: string, currentPath?: string): string {
  if (process.platform === 'darwin') {
    return getMacFolderDialogCmd(title, currentPath);
  }
  return getWindowsFolderDialogCmd(title, currentPath);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type = body.type === 'ads' ? 'ads' : 'sales';
    const title = type === 'ads' ? 'рекламе' : 'продажам';

    const cfgPath = getConfigPath();
    let currentPath = '';
    if (fs.existsSync(/*turbopackIgnore: true*/ cfgPath)) {
      try {
        const raw = fs.readFileSync(/*turbopackIgnore: true*/ cfgPath, 'utf-8');
        const cfg = JSON.parse(raw);
        currentPath = type === 'ads' ? cfg.ads_dir : cfg.sales_dir;
      } catch (e) {
        // ignore
      }
    }

    const cmd = getFolderDialogCmd(title, currentPath);

    return new Promise<NextResponse>((resolve) => {
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.error('Ошибка выбора папки на Windows:', error, stderr);
          return resolve(NextResponse.json({ success: false, error: stderr || error.message }, { status: 500 }));
        }

        let chosenPath = stdout.trim();
        if (chosenPath === '__CANCELED__' || !chosenPath) {
          return resolve(NextResponse.json({ success: false, canceled: true }));
        }

        if (chosenPath.endsWith('/') || chosenPath.endsWith('\\')) {
          chosenPath = chosenPath.slice(0, -1);
        }

        const cfgPath = getConfigPath();
        const projectRoot = getProjectRoot();
        let config = {
          ads_dir: path.join(projectRoot, 'data', 'ads'),
          sales_dir: path.join(projectRoot, 'data', 'sales')
        };

        if (fs.existsSync(/*turbopackIgnore: true*/ cfgPath)) {
          try {
            config = { ...config, ...JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ cfgPath, 'utf-8')) };
          } catch (e) {
            // ignore
          }
        }

        if (type === 'ads') {
          config.ads_dir = chosenPath;
        } else {
          config.sales_dir = chosenPath;
        }

        try {
          fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf-8');
        } catch (writeErr) {
          console.error('Ошибка сохранения config.json:', writeErr);
        }

        return resolve(NextResponse.json({
          success: true,
          type,
          path: chosenPath,
          config
        }));
      });
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
