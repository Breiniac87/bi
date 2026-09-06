#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <mach-o/dyld.h>
#include <limits.h>
#include <libgen.h>
#include <sys/types.h>

int find_script(char *script_path, size_t max_len) {
    char exe_path[PATH_MAX];
    uint32_t size = sizeof(exe_path);
    const char *home = getenv("HOME");

    if (_NSGetExecutablePath(exe_path, &size) == 0) {
        char path_copy[PATH_MAX];
        
        // 1. Проверяем Contents/Resources/launch.sh внутри самого бандла
        strncpy(path_copy, exe_path, sizeof(path_copy));
        char *macos_dir = dirname(path_copy);
        char *contents_dir = dirname(macos_dir);
        snprintf(script_path, max_len, "%s/Resources/launch.sh", contents_dir);
        if (access(script_path, X_OK) == 0) return 0;

        // 2. Проверяем project_dir/scripts/launch.sh (когда .app лежит внутри проекта)
        char *bundle_dir = dirname(contents_dir);
        char *parent_dir = dirname(bundle_dir);
        snprintf(script_path, max_len, "%s/scripts/launch.sh", parent_dir);
        if (access(script_path, X_OK) == 0) return 0;

        // 3. Проверяем соседнюю папку "dashbord app/scripts/launch.sh" (когда .app лежит на Рабочем столе)
        snprintf(script_path, max_len, "%s/dashbord app/scripts/launch.sh", parent_dir);
        if (access(script_path, X_OK) == 0) return 0;
    }

    // 4. Проверяем стандартные пути через домашний каталог пользователя $HOME
    if (home && strlen(home) > 0) {
        snprintf(script_path, max_len, "%s/Desktop/dashbord app/scripts/launch.sh", home);
        if (access(script_path, X_OK) == 0) return 0;

        snprintf(script_path, max_len, "%s/dashbord app/scripts/launch.sh", home);
        if (access(script_path, X_OK) == 0) return 0;
    }

    return -1;
}

int main(int argc, char *argv[]) {
    char script_path[PATH_MAX];

    if (find_script(script_path, sizeof(script_path)) != 0) {
        // Если скрипт не найден, пробуем базовый путь
        const char *home = getenv("HOME") ? getenv("HOME") : "/tmp";
        snprintf(script_path, sizeof(script_path), "%s/Desktop/dashbord app/scripts/launch.sh", home);
    }

    // Делаем fork и отвязываем дочерний процесс от сессии Finder (setsid),
    // чтобы macOS не завершала процесс при выходе лаунчера.
    pid_t pid = fork();
    if (pid < 0) {
        char cmd[PATH_MAX + 32];
        snprintf(cmd, sizeof(cmd), "'%s' &", script_path);
        system(cmd);
        return 0;
    }
    if (pid == 0) {
        setsid();
        execl("/bin/bash", "bash", script_path, (char *)NULL);
        _exit(1);
    }

    return 0;
}
