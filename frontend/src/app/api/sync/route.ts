import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getMetrics } from '@/lib/db';

let isSyncRunning = false;
let syncStartedAt = 0;

function isFile(p?: string | null): boolean {
  if (!p) return false;
  try {
    const stat = fs.statSync(p);
    return stat.isFile();
  } catch {
    return false;
  }
}

function getProjectRoot(): string {
  let curr = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(curr, 'sync_local_to_sqlite.py')) || fs.existsSync(path.join(curr, 'data'))) {
      return curr;
    }
    const parent = path.resolve(curr, '..');
    if (parent === curr) break;
    curr = parent;
  }
  return process.cwd();
}

function getPythonPath(projectRoot: string): string | null {
  if (process.env.PYTHON_PATH && isFile(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }
  const venvPythonWin = path.join(projectRoot, 'venv', 'Scripts', 'python.exe');
  if (isFile(venvPythonWin)) {
    return venvPythonWin;
  }
  const venvPython = path.join(projectRoot, 'venv', 'bin', 'python3');
  if (isFile(venvPython)) {
    return venvPython;
  }
  return null;
}

interface EtlRunner {
  cmd: string;
  args: string[];
  cwd: string;
}

function getEtlRunner(additionalArgs: string[]): EtlRunner {
  const cwd = process.cwd();
  const root = getProjectRoot();
  const exeName = process.platform === 'win32' ? 'sync_local_to_sqlite.exe' : 'sync_local_to_sqlite';

  // 1. Проверяем явно заданную переменную окружения для бинарника (только если это действительно исполняемый файл)
  if (process.env.ETL_BIN_PATH && isFile(process.env.ETL_BIN_PATH)) {
    return {
      cmd: process.env.ETL_BIN_PATH,
      args: additionalArgs,
      cwd: path.dirname(process.env.ETL_BIN_PATH)
    };
  }

  // 2. Приоритет Python-скрипта (работает за 0.8с против 30с у PyInstaller на macOS)
  const pythonPath = getPythonPath(root);
  const scriptCandidates = [
    path.join(root, 'sync_local_to_sqlite.py'),
    path.resolve(cwd, '../etl/sync_local_to_sqlite.py'),
    path.resolve(cwd, './etl/sync_local_to_sqlite.py'),
    path.resolve(cwd, 'sync_local_to_sqlite.py')
  ];

  if (pythonPath) {
    for (const sc of scriptCandidates) {
      if (isFile(sc)) {
        return {
          cmd: pythonPath,
          args: [sc, ...additionalArgs],
          cwd: path.dirname(sc)
        };
      }
    }
  }

  // 3. Проверяем автономный скомпилированный бинарник внутри бандла
  const bundledCandidates = [
    path.resolve(cwd, `../etl/sync_local_to_sqlite/${exeName}`),
    path.resolve(cwd, `./etl/sync_local_to_sqlite/${exeName}`),
    path.resolve(cwd, `../etl/${exeName}`),
    path.resolve(cwd, `./etl/${exeName}`)
  ];
  for (const b of bundledCandidates) {
    if (isFile(b)) {
      return {
        cmd: b,
        args: additionalArgs,
        cwd: path.dirname(b)
      };
    }
  }

  // 4. Проверяем скомпилированный бинарник в папке dist проекта
  const distCandidates = [
    path.resolve(root, `dist/sync_local_to_sqlite/${exeName}`),
    path.resolve(cwd, `../dist/sync_local_to_sqlite/${exeName}`),
    path.resolve(root, `dist/${exeName}`)
  ];
  for (const distBin of distCandidates) {
    if (isFile(distBin)) {
      return {
        cmd: distBin,
        args: additionalArgs,
        cwd: path.dirname(distBin)
      };
    }
  }

  // 5. Системный python3 как запасной вариант
  for (const sc of scriptCandidates) {
    if (isFile(sc)) {
      return {
        cmd: process.platform === 'win32' ? 'python' : 'python3',
        args: [sc, ...additionalArgs],
        cwd: path.dirname(sc)
      };
    }
  }

  // Если ничего не найдено, возвращаем ожидаемый путь бинарника
  const fallbackBin = path.resolve(cwd, `../etl/sync_local_to_sqlite/${exeName}`);
  return {
    cmd: fallbackBin,
    args: additionalArgs,
    cwd: path.dirname(fallbackBin)
  };
}

function safeJsonParse(text?: string | null): any {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function GET() {
  const runner = getEtlRunner(['--status', '--json']);

  return new Promise<NextResponse>((resolve) => {
    execFile(runner.cmd, runner.args, { cwd: runner.cwd, timeout: 30000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Error fetching sync status:', error, stderr);
        return resolve(NextResponse.json({
          success: false,
          error: stderr ? stderr.trim() : error.message,
          runner
        }, { status: 500 }));
      }
      try {
        const json = safeJsonParse(stdout);
        if (json) {
          return resolve(NextResponse.json({
            success: true,
            status: json,
            isSyncRunning
          }));
        }
        return resolve(NextResponse.json({
          success: false,
          error: 'Не удалось распарсить статус БД',
          raw: stdout
        }, { status: 500 }));
      } catch (parseErr: any) {
        return resolve(NextResponse.json({
          success: false,
          error: parseErr.message,
          raw: stdout
        }, { status: 500 }));
      }
    });
  });
}

export async function POST(request: Request) {
  // Сброс зависшего флага синхронизации, если прошло больше 120 секунд
  if (isSyncRunning && Date.now() - syncStartedAt > 120000) {
    console.warn('Сброс зависшего статуса синхронизации по таймауту');
    isSyncRunning = false;
  }

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
  syncStartedAt = Date.now();

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

          if (!result) {
            return resolve(NextResponse.json({
              success: false,
              error: 'ETL процесс не вернул корректный JSON отчет',
              raw: stdout || stderr
            }, { status: 500 }));
          }

          const updatedData = getMetrics();
          return resolve(NextResponse.json({
            success: true,
            syncResult: result,
            data: updatedData
          }));
        } catch (parseErr: any) {
          return resolve(NextResponse.json({
            success: false,
            error: parseErr.message,
            raw: stdout
          }, { status: 500 }));
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
