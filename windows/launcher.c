#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <wininet.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <stdio.h>
#include <stdlib.h>

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "wininet.lib")
#pragma comment(lib, "shlwapi.lib")

#define PORT_STR L"3000"
#define APP_URL L"http://127.0.0.1:3000"

// Проверка доступности HTTP-сервера
static BOOL IsServerReady(void) {
    HINTERNET hInternet = InternetOpenW(L"ECommerceDashboardLauncher/1.0", INTERNET_OPEN_TYPE_DIRECT, NULL, NULL, 0);
    if (!hInternet) return FALSE;

    DWORD timeoutMs = 800;
    InternetSetOptionW(hInternet, INTERNET_OPTION_CONNECT_TIMEOUT, &timeoutMs, sizeof(timeoutMs));
    InternetSetOptionW(hInternet, INTERNET_OPTION_RECEIVE_TIMEOUT, &timeoutMs, sizeof(timeoutMs));

    HINTERNET hUrl = InternetOpenUrlW(
        hInternet,
        APP_URL,
        NULL,
        0,
        INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE | INTERNET_FLAG_PRAGMA_NOCACHE,
        0
    );

    BOOL ready = FALSE;
    if (hUrl) {
        DWORD statusCode = 0;
        DWORD statusSize = sizeof(statusCode);
        if (HttpQueryInfoW(hUrl, HTTP_QUERY_STATUS_CODE | HTTP_QUERY_FLAG_NUMBER, &statusCode, &statusSize, NULL)) {
            if (statusCode == 200 || statusCode == 304 || statusCode == 307 || statusCode == 308) {
                ready = TRUE;
            }
        } else {
            // Если статус код не считался, но соединение открыто - сервер живой
            ready = TRUE;
        }
        InternetCloseHandle(hUrl);
    }
    InternetCloseHandle(hInternet);
    return ready;
}

// Открытие окна приложения в Edge App / Chrome / системном браузере
static void OpenAppWindow(const WCHAR *appDataDir) {
    WCHAR browserExe[MAX_PATH] = {0};
    WCHAR args[MAX_PATH * 2] = {0};

    // 1. Проверяем Microsoft Edge
    const WCHAR *edgePaths[] = {
        L"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        L"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        NULL
    };

    for (int i = 0; edgePaths[i] != NULL; i++) {
        if (PathFileExistsW(edgePaths[i])) {
            wcscpy_s(browserExe, MAX_PATH, edgePaths[i]);
            break;
        }
    }

    if (browserExe[0] == L'\0') {
        // Проверяем Edge в LocalAppData
        WCHAR localApp[MAX_PATH];
        if (GetEnvironmentVariableW(L"LOCALAPPDATA", localApp, MAX_PATH) > 0) {
            WCHAR testEdge[MAX_PATH];
            swprintf_s(testEdge, MAX_PATH, L"%s\\Microsoft\\Edge\\Application\\msedge.exe", localApp);
            if (PathFileExistsW(testEdge)) {
                wcscpy_s(browserExe, MAX_PATH, testEdge);
            }
        }
    }

    // 2. Если Edge найден, запускаем в режиме окна приложения (--app)
    if (browserExe[0] != L'\0') {
        swprintf_s(args, MAX_PATH * 2, L"--app=\"%s\" --user-data-dir=\"%s\\EdgeProfile\"", APP_URL, appDataDir);
        HINSTANCE hInst = ShellExecuteW(NULL, L"open", browserExe, args, NULL, SW_SHOWNORMAL);
        if ((INT_PTR)hInst > 32) {
            return;
        }
    }

    // 3. Проверяем Google Chrome
    const WCHAR *chromePaths[] = {
        L"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        L"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        NULL
    };
    for (int i = 0; chromePaths[i] != NULL; i++) {
        if (PathFileExistsW(chromePaths[i])) {
            swprintf_s(args, MAX_PATH * 2, L"--app=\"%s\"", APP_URL);
            HINSTANCE hInst = ShellExecuteW(NULL, L"open", chromePaths[i], args, NULL, SW_SHOWNORMAL);
            if ((INT_PTR)hInst > 32) {
                return;
            }
        }
    }

    // 4. Fallback: системный браузер по умолчанию
    ShellExecuteW(NULL, L"open", APP_URL, NULL, NULL, SW_SHOWNORMAL);
}

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPWSTR lpCmdLine, int nShowCmd) {
    UNREFERENCED_PARAMETER(hInstance);
    UNREFERENCED_PARAMETER(hPrevInstance);
    UNREFERENCED_PARAMETER(lpCmdLine);
    UNREFERENCED_PARAMETER(nShowCmd);

    // Получаем путь к директории приложения
    WCHAR appDir[MAX_PATH] = {0};
    if (GetModuleFileNameW(NULL, appDir, MAX_PATH) == 0) {
        MessageBoxW(NULL, L"Не удалось определить путь к приложению.", L"E-Commerce Dashboard", MB_ICONERROR | MB_OK);
        return 1;
    }
    PathRemoveFileSpecW(appDir);
    SetCurrentDirectoryW(appDir);

    // Папка AppData
    WCHAR appData[MAX_PATH] = {0};
    if (GetEnvironmentVariableW(L"APPDATA", appData, MAX_PATH) == 0) {
        wcscpy_s(appData, MAX_PATH, L"C:\\ProgramData");
    }
    WCHAR appDataDir[MAX_PATH] = {0};
    swprintf_s(appDataDir, MAX_PATH, L"%s\\ECommerceDashboard", appData);
    CreateDirectoryW(appDataDir, NULL);

    // Подготовка шаблонов БД и конфига при первом запуске
    WCHAR userDb[MAX_PATH];
    swprintf_s(userDb, MAX_PATH, L"%s\\dashboard.db", appDataDir);
    if (!PathFileExistsW(userDb)) {
        WCHAR templateDb[MAX_PATH];
        swprintf_s(templateDb, MAX_PATH, L"%s\\template.db", appDir);
        if (PathFileExistsW(templateDb)) {
            CopyFileW(templateDb, userDb, FALSE);
        }
    }

    WCHAR userCfg[MAX_PATH];
    swprintf_s(userCfg, MAX_PATH, L"%s\\config.json", appDataDir);
    if (!PathFileExistsW(userCfg)) {
        WCHAR templateCfg[MAX_PATH];
        swprintf_s(templateCfg, MAX_PATH, L"%s\\template_config.json", appDir);
        if (PathFileExistsW(templateCfg)) {
            CopyFileW(templateCfg, userCfg, FALSE);
        }
    }

    // Если сервер уже запущен — просто открываем окно
    if (IsServerReady()) {
        OpenAppWindow(appDataDir);
        return 0;
    }

    // Проверяем наличие node.exe
    WCHAR nodeExe[MAX_PATH];
    swprintf_s(nodeExe, MAX_PATH, L"%s\\node.exe", appDir);
    if (!PathFileExistsW(nodeExe)) {
        // Проверяем в системном PATH
        if (SearchPathW(NULL, L"node.exe", NULL, MAX_PATH, nodeExe, NULL) == 0) {
            MessageBoxW(
                NULL,
                L"Рантайм Node.js (node.exe) не найден в папке приложения.\nПожалуйста, переустановите программу.",
                L"E-Commerce Dashboard - Ошибка",
                MB_ICONERROR | MB_OK
            );
            return 1;
        }
    }

    // Проверяем наличие app\server.js
    WCHAR serverJs[MAX_PATH];
    swprintf_s(serverJs, MAX_PATH, L"%s\\app\\server.js", appDir);
    if (!PathFileExistsW(serverJs)) {
        WCHAR msg[MAX_PATH * 2];
        swprintf_s(msg, MAX_PATH * 2, L"Файл сервера не найден:\n%s\nПожалуйста, переустановите программу.", serverJs);
        MessageBoxW(NULL, msg, L"E-Commerce Dashboard - Ошибка", MB_ICONERROR | MB_OK);
        return 1;
    }

    // Подготовка файла логов
    WCHAR logFile[MAX_PATH];
    swprintf_s(logFile, MAX_PATH, L"%s\\server.log", appDataDir);

    SECURITY_ATTRIBUTES sa;
    sa.nLength = sizeof(sa);
    sa.lpSecurityDescriptor = NULL;
    sa.bInheritHandle = TRUE;

    HANDLE hLog = CreateFileW(
        logFile,
        FILE_APPEND_DATA,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        &sa,
        OPEN_ALWAYS,
        FILE_ATTRIBUTE_NORMAL,
        NULL
    );

    // Установка переменных окружения для процесса сервера
    SetEnvironmentVariableW(L"PORT", PORT_STR);
    SetEnvironmentVariableW(L"HOSTNAME", L"127.0.0.1");
    SetEnvironmentVariableW(L"NODE_ENV", L"production");
    SetEnvironmentVariableW(L"DATABASE_PATH", userDb);
    SetEnvironmentVariableW(L"CONFIG_PATH", userCfg);

    WCHAR etlExe[MAX_PATH];
    swprintf_s(etlExe, MAX_PATH, L"%s\\etl\\sync_local_to_sqlite\\sync_local_to_sqlite.exe", appDir);
    if (PathFileExistsW(etlExe)) {
        SetEnvironmentVariableW(L"ETL_BIN_PATH", etlExe);
    }

    // Запуск сервера Node.js без окна консоли
    WCHAR cmdLine[MAX_PATH * 2];
    swprintf_s(cmdLine, MAX_PATH * 2, L"\"%s\" server.js", nodeExe);

    WCHAR appSubDir[MAX_PATH];
    swprintf_s(appSubDir, MAX_PATH, L"%s\\app", appDir);

    STARTUPINFOW si;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    if (hLog != INVALID_HANDLE_VALUE) {
        si.dwFlags |= STARTF_USESTDHANDLES;
        si.hStdOutput = hLog;
        si.hStdError = hLog;
        si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    }

    PROCESS_INFORMATION pi;
    ZeroMemory(&pi, sizeof(pi));

    BOOL procCreated = CreateProcessW(
        NULL,
        cmdLine,
        NULL,
        NULL,
        (hLog != INVALID_HANDLE_VALUE) ? TRUE : FALSE,
        CREATE_NO_WINDOW | DETACHED_PROCESS,
        NULL,
        appSubDir,
        &si,
        &pi
    );

    if (hLog != INVALID_HANDLE_VALUE) {
        CloseHandle(hLog);
    }

    if (!procCreated) {
        DWORD err = GetLastError();
        WCHAR errBuf[MAX_PATH * 2];
        swprintf_s(errBuf, MAX_PATH * 2, L"Не удалось запустить сервер Node.js (код ошибки %lu).\nПроверьте права доступа к папке приложения.", err);
        MessageBoxW(NULL, errBuf, L"E-Commerce Dashboard - Ошибка", MB_ICONERROR | MB_OK);
        return 1;
    }

    // Сохраняем дескрипторы
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);

    // Ожидание готовности сервера (до 25 секунд)
    BOOL ready = FALSE;
    for (int i = 0; i < 50; i++) {
        Sleep(500);
        if (IsServerReady()) {
            ready = TRUE;
            break;
        }
    }

    if (!ready) {
        MessageBoxW(
            NULL,
            L"Сервер приложения не успел ответить вовремя (таймаут 25 сек).\nПодробности записаны в файл логов:\n%APPDATA%\\ECommerceDashboard\\server.log",
            L"E-Commerce Dashboard - Предупреждение",
            MB_ICONWARNING | MB_OK
        );
    }

    // Открываем окно приложения
    OpenAppWindow(appDataDir);

    return 0;
}
