import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getMetrics } from '@/lib/db';

let isSyncRunning = false;

function getProjectRoot(): string {
  let curr = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(curr, 'sync_local_to_sqlite.py'))) {
      return curr;
    }
    const parent = path.resolve(curr, '..');
    if (parent === curr) break;
    curr = parent;
  }
  return process.cwd();
}

function getPythonPath(projectRoot: string): string {
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }
  const venvPythonWin = path.join(projectRoot, 'venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPythonWin)) {
    return venvPythonWin;
  }
  const venvPython = path.join(projectRoot, 'venv', 'bin', 'python3');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

interface EtlRunner {
  cmd: string;
  args: string[];
  cwd: string;
}

function getEtlRunner(additionalArgs: string[]): EtlRunner {
  const cwd = process.cwd();
  const root = getProjectRoot();
  const exeName = 'sync_local_to_sqlite.exe';

  // 1. Проверяем явно заданную переменную окружения для бинарника
  if (process.env.ETL_BIN_PATH && fs.existsSync(/*turbopackIgnore: true*/ process.env.ETL_BIN_PATH)) {
    return {
      cmd: process.env.ETL_BIN_PATH,
      args: additionalArgs,
      cwd: path.dirname(process.env.ETL_BIN_PATH)
    };
  }

  // 2. Проверяем автономный скомпилированный бинарник внутри бандла (../etl/...)
  const bundledCandidates = [
    path.resolve(cwd, `../etl/sync_local_to_sqlite/${exeName}`),
    path.resolve(cwd, `../etl/${exeName}`),
    path.resolve(cwd, `./etl/sync_local_to_sqlite/${exeName}`),
    path.resolve(cwd, `./etl/${exeName}`)
  ];
  for (const b of bundledCandidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ b)) {
      return {
        cmd: b,
        args: additionalArgs,
        cwd: path.dirname(b)
      };
    }
  }

  // 3. Проверяем скомпилированный бинарник в папке dist проекта
  const distCandidates = [
    path.resolve(root, `dist/sync_local_to_sqlite/${exeName}`),
    path.resolve(cwd, `../dist/sync_local_to_sqlite/${exeName}`),
    path.resolve(root, `dist/${exeName}`)
  ];
  for (const distBin of distCandidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ distBin)) {
      return {
        cmd: distBin,
        args: additionalArgs,
        cwd: path.dirname(distBin)
      };
    }
  }

  // 4. Fallback на Python скрипт (ETL_SCRIPT_PATH или sync_local_to_sqlite.py)
  let scriptPath = '';
  let scriptCwd = cwd;
  if (process.env.ETL_SCRIPT_PATH && fs.existsSync(/*turbopackIgnore: true*/ process.env.ETL_SCRIPT_PATH)) {
    scriptPath = process.env.ETL_SCRIPT_PATH;
    scriptCwd = path.dirname(scriptPath);
  } else {
    const bundledScript = path.resolve(cwd, '../etl/sync_local_to_sqlite.py');
    if (fs.existsSync(/*turbopackIgnore: true*/ bundledScript)) {
      scriptPath = bundledScript;
      scriptCwd = path.dirname(bundledScript);
    } else {
      scriptPath = path.join(root, 'sync_local_to_sqlite.py');
      scriptCwd = root;
    }
  }

  const pythonPath = getPythonPath(scriptCwd);
  return {
    cmd: pythonPath,
    args: [scriptPath, ...additionalArgs],
    cwd: scriptCwd
  };
}

function safeJsonParse(text: string): any {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('No valid JSON object found in output');
  }
}

export async function GET() {
  const runner = getEtlRunner(['--status', '--json']);

  return new Promise<NextResponse>((resolve) => {
    execFile(runner.cmd, runner.args, { cwd: runner.cwd, timeout: 30000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Error fetching sync status:', error, stderr);
        return resolve(NextResponse.json({ success: false, error: stderr || error.message }, { status: 500 }));
      }
      try {
        const json = safeJsonParse(stdout);
        return resolve(NextResponse.json({
          success: true,
          status: json,
          isSyncRunning
        }));
      } catch (parseErr) {
        return resolve(NextResponse.json({ success: false, error: 'Failed to parse status JSON', raw: stdout }, { status: 500 }));
      }
    });
  });
}

export async function POST(request: Request) {
  if (isSyncRunning) {
    return NextResponse.json({
      success: false,
      inProgress: true,
      error: 'Синхронизация уже выполняется. Пожалуйста, дождитесь завершения текущего процесса.'
    }, { status: 409 });
  }

  let body: { forceRebuild?: boolean; rebuildAll?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  const flags = ['--json'];
  if (body.rebuildAll) {
    flags.push('--rebuild-all');
  } else if (body.forceRebuild) {
    flags.push('--force-merged');
  }

  const runner = getEtlRunner(flags);
  isSyncRunning = true;

  return new Promise<NextResponse>((resolve) => {
    try {
      execFile(runner.cmd, runner.args, { cwd: runner.cwd, timeout: 180000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        isSyncRunning = false;

        if (error) {
          console.error('Error running sync:', error, stderr);
          const parsed = safeJsonParse(stdout) || safeJsonParse(stderr);
          const errMsg = parsed?.error || (stderr ? stderr.trim() : error.message);
          return resolve(NextResponse.json({
            success: false,
            error: errMsg,
            status: parsed?.status
          }, { status: 400 }));
        }
        try {
          const result = safeJsonParse(stdout);
          if (result && result.success === false) {
            return resolve(NextResponse.json({
              success: false,
              error: result.error || 'Ошибка валидации данных',
              status: result.status
            }, { status: 400 }));
          }
          const updatedData = getMetrics();
          return resolve(NextResponse.json({
            success: true,
            syncResult: result,
            data: updatedData
          }));
        } catch (parseErr) {
          return resolve(NextResponse.json({ success: false, error: 'Failed to parse sync output', raw: stdout }, { status: 500 }));
        }
      });
    } catch (launchErr: any) {
      isSyncRunning = false;
      return resolve(NextResponse.json({
        success: false,
        error: launchErr?.message || 'Не удалось запустить процесс синхронизации'
      }, { status: 500 }));
    }
  });
}
