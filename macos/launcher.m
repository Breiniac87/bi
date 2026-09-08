#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <signal.h>
#import <sys/types.h>
#import <sys/socket.h>
#import <netinet/in.h>
#import <arpa/inet.h>
#import <unistd.h>

static NSTask *gServerTask = nil;
static pid_t gServerPid = 0;
static NSString *gAppUrl = @"http://127.0.0.1:3000";
static BOOL gIsTerminating = NO;

static void cleanupServer(void) {
    gIsTerminating = YES;
    if (gServerPid > 0) {
        kill(gServerPid, SIGTERM);
        usleep(150000); // 150ms
        kill(gServerPid, SIGKILL);
        gServerPid = 0;
    }
    if (gServerTask && [gServerTask isRunning]) {
        [gServerTask terminate];
        gServerTask = nil;
    }
}

static void sigHandler(int sig) {
    cleanupServer();
    exit(0);
}

// Find node binary
static NSString* findNodeBinary(NSString *bundleResources, NSString *workspaceRoot) {
    NSFileManager *fm = [NSFileManager defaultManager];
    
    // 1. Inside bundle Resources
    NSString *bundledNode = [bundleResources stringByAppendingPathComponent:@"node"];
    if ([fm isExecutableFileAtPath:bundledNode]) return bundledNode;
    
    // 2. Next to .app or in workspace
    if (workspaceRoot) {
        NSString *wsNode = [workspaceRoot stringByAppendingPathComponent:@"node"];
        if ([fm isExecutableFileAtPath:wsNode]) return wsNode;
    }
    
    // 3. Current process PATH or common macOS locations
    NSArray<NSString*> *candidates = @[
        @"/opt/homebrew/bin/node",
        @"/usr/local/bin/node",
        @"/usr/bin/node"
    ];
    for (NSString *p in candidates) {
        if ([fm isExecutableFileAtPath:p]) return p;
    }
    
    // 4. Search NVM paths in user home directory
    NSString *home = NSHomeDirectory();
    NSString *nvmDir = [home stringByAppendingPathComponent:@".nvm/versions/node"];
    if ([fm fileExistsAtPath:nvmDir]) {
        NSArray<NSString*> *versions = [fm contentsOfDirectoryAtPath:nvmDir error:nil];
        if (versions && versions.count > 0) {
            // Sort descending so latest version comes first
            NSArray *sorted = [versions sortedArrayUsingSelector:@selector(localizedStandardCompare:)];
            for (NSInteger i = (NSInteger)sorted.count - 1; i >= 0; i--) {
                NSString *vNode = [[nvmDir stringByAppendingPathComponent:sorted[i]] stringByAppendingPathComponent:@"bin/node"];
                if ([fm isExecutableFileAtPath:vNode]) return vNode;
            }
        }
    }
    
    // Fallback: check `which node`
    NSTask *whichTask = [[NSTask alloc] init];
    whichTask.launchPath = @"/usr/bin/which";
    whichTask.arguments = @[@"node"];
    NSPipe *pipe = [NSPipe pipe];
    whichTask.standardOutput = pipe;
    [whichTask launch];
    [whichTask waitUntilExit];
    if (whichTask.terminationStatus == 0) {
        NSData *data = [pipe.fileHandleForReading readDataToEndOfFile];
        NSString *outStr = [[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        if (outStr.length > 0 && [fm isExecutableFileAtPath:outStr]) {
            return outStr;
        }
    }
    
    return nil;
}

// Check if HTTP server is responding on port 3000 via direct TCP socket
static BOOL isServerResponding(NSString *urlStr) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return NO;
    
    struct timeval timeout;
    timeout.tv_sec = 0;
    timeout.tv_usec = 250000; // 250ms
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
    
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(3000);
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");
    
    int res = connect(sock, (struct sockaddr *)&addr, sizeof(addr));
    close(sock);
    return (res == 0);
}

@interface AppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate>
@property (strong) NSWindow *window;
@property (strong) WKWebView *webView;
@property (strong) NSProgressIndicator *spinner;
@property (strong) NSTextField *statusLabel;
@end

@implementation AppDelegate

- (void)setupMenus {
    NSMenu *menubar = [[NSMenu alloc] init];
    
    // Application Menu
    NSMenuItem *appMenuItem = [[NSMenuItem alloc] init];
    [menubar addItem:appMenuItem];
    NSMenu *appMenu = [[NSMenu alloc] initWithTitle:@"E-Commerce Dashboard"];
    [appMenu addItemWithTitle:@"О программе E-Commerce Dashboard" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"Скрыть" action:@selector(hide:) keyEquivalent:@"h"];
    NSMenuItem *hideOthers = [appMenu addItemWithTitle:@"Скрыть остальные" action:@selector(hideOtherApplications:) keyEquivalent:@"h"];
    hideOthers.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagOption;
    [appMenu addItemWithTitle:@"Показать все" action:@selector(unhideAllApplications:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"Завершить E-Commerce Dashboard" action:@selector(terminateApp) keyEquivalent:@"q"];
    appMenuItem.submenu = appMenu;
    
    // Edit Menu (Crucial for Cmd+C, Cmd+V, Cmd+A, Cmd+Z in web views)
    NSMenuItem *editMenuItem = [[NSMenuItem alloc] init];
    [menubar addItem:editMenuItem];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Правка"];
    [editMenu addItemWithTitle:@"Отменить" action:@selector(undo:) keyEquivalent:@"z"];
    [editMenu addItemWithTitle:@"Повторить" action:@selector(redo:) keyEquivalent:@"Z"];
    [editMenu addItem:[NSMenuItem separatorItem]];
    [editMenu addItemWithTitle:@"Вырезать" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"Скопировать" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"Вставить" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"Выбрать всё" action:@selector(selectAll:) keyEquivalent:@"a"];
    editMenuItem.submenu = editMenu;
    
    // View Menu
    NSMenuItem *viewMenuItem = [[NSMenuItem alloc] init];
    [menubar addItem:viewMenuItem];
    NSMenu *viewMenu = [[NSMenu alloc] initWithTitle:@"Вид"];
    [viewMenu addItemWithTitle:@"Перезагрузить дашборд" action:@selector(reloadDashboard) keyEquivalent:@"r"];
    [viewMenu addItemWithTitle:@"Открыть в браузере (Safari / Chrome)" action:@selector(openInBrowser) keyEquivalent:@"b"];
    [viewMenu addItem:[NSMenuItem separatorItem]];
    [viewMenu addItemWithTitle:@"Перейти на весь экран" action:@selector(toggleFullScreen:) keyEquivalent:@"f"];
    viewMenuItem.submenu = viewMenu;
    
    // Window Menu
    NSMenuItem *windowMenuItem = [[NSMenuItem alloc] init];
    [menubar addItem:windowMenuItem];
    NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Окно"];
    [windowMenu addItemWithTitle:@"Свернуть" action:@selector(performMiniaturize:) keyEquivalent:@"m"];
    [windowMenu addItemWithTitle:@"Масштабировать" action:@selector(performZoom:) keyEquivalent:@""];
    [windowMenu addItem:[NSMenuItem separatorItem]];
    [windowMenu addItemWithTitle:@"Все окна на передний план" action:@selector(arrangeInFront:) keyEquivalent:@""];
    windowMenuItem.submenu = windowMenu;
    
    [NSApp setMainMenu:menubar];
}

- (void)reloadDashboard {
    [self.webView reload];
}

- (void)openInBrowser {
    [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:gAppUrl]];
}

- (void)terminateApp {
    cleanupServer();
    [NSApp terminate:nil];
}

- (BOOL)windowShouldClose:(NSWindow *)sender {
    cleanupServer();
    [NSApp terminate:nil];
    return YES;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    cleanupServer();
}

#pragma mark - WKUIDelegate

- (void)webView:(WKWebView *)webView runJavaScriptAlertPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(void))completionHandler {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"E-Commerce Dashboard";
    alert.informativeText = message;
    [alert addButtonWithTitle:@"OK"];
    if (self.window) {
        [alert beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse returnCode) {
            completionHandler();
        }];
    } else {
        [alert runModal];
        completionHandler();
    }
}

- (void)webView:(WKWebView *)webView runJavaScriptConfirmPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(BOOL result))completionHandler {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Подтверждение действия";
    alert.informativeText = message;
    [alert addButtonWithTitle:@"Завершить"];
    [alert addButtonWithTitle:@"Отмена"];
    if (self.window) {
        [alert beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse returnCode) {
            completionHandler(returnCode == NSAlertFirstButtonReturn);
        }];
    } else {
        NSModalResponse res = [alert runModal];
        completionHandler(res == NSAlertFirstButtonReturn);
    }
}

- (void)webViewDidClose:(WKWebView *)webView {
    if (!gIsTerminating) {
        cleanupServer();
        [NSApp terminate:nil];
    }
}

#pragma mark - WKNavigationDelegate

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    NSLog(@"[WebView] Provisional navigation failed: %@", error.localizedDescription);
    // If server was still initializing routes, retry loadRequest after 400ms
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.4 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:gAppUrl] cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:10.0]];
    });
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    NSLog(@"[WebView] Navigation failed: %@", error.localizedDescription);
}

- (void)applicationDidFinishLaunching:(NSNotification *)aNotification {
    signal(SIGINT, sigHandler);
    signal(SIGTERM, sigHandler);
    signal(SIGHUP, sigHandler);
    
    [self setupMenus];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    
    // Configure main window
    NSRect screenRect = [[NSScreen mainScreen] visibleFrame];
    CGFloat width = MIN(1440, screenRect.size.width * 0.92);
    CGFloat height = MIN(920, screenRect.size.height * 0.92);
    NSRect initialRect = NSMakeRect((screenRect.size.width - width) / 2 + screenRect.origin.x,
                                    (screenRect.size.height - height) / 2 + screenRect.origin.y,
                                    width, height);
    
    self.window = [[NSWindow alloc] initWithContentRect:initialRect
                                              styleMask:(NSWindowStyleMaskTitled |
                                                         NSWindowStyleMaskClosable |
                                                         NSWindowStyleMaskMiniaturizable |
                                                         NSWindowStyleMaskResizable)
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    self.window.title = @"E-Commerce Analytics Dashboard";
    self.window.minSize = NSMakeSize(1024, 680);
    self.window.delegate = self;
    
    NSView *contentView = self.window.contentView;
    
    // Progress Indicator & Label while loading
    self.spinner = [[NSProgressIndicator alloc] initWithFrame:NSMakeRect((width - 40) / 2, (height / 2) + 20, 40, 40)];
    self.spinner.style = NSProgressIndicatorStyleSpinning;
    self.spinner.controlSize = NSControlSizeLarge;
    [self.spinner startAnimation:nil];
    [contentView addSubview:self.spinner];
    
    self.statusLabel = [[NSTextField alloc] initWithFrame:NSMakeRect(20, (height / 2) - 35, width - 40, 30)];
    self.statusLabel.editable = NO;
    self.statusLabel.selectable = NO;
    self.statusLabel.bordered = NO;
    self.statusLabel.backgroundColor = [NSColor clearColor];
    self.statusLabel.alignment = NSTextAlignmentCenter;
    self.statusLabel.font = [NSFont systemFontOfSize:14 weight:NSFontWeightMedium];
    self.statusLabel.textColor = [NSColor secondaryLabelColor];
    self.statusLabel.stringValue = @"Инициализация дашборда и проверка локального сервера...";
    [contentView addSubview:self.statusLabel];
    
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    
    // Launch server in background thread if not already running
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        [self ensureServerRunningAndLoadUI];
    });
}

- (void)ensureServerRunningAndLoadUI {
    // 1. Check if server is already running
    if (isServerResponding(gAppUrl)) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self loadWebView];
        });
        return;
    }
    
    // 2. Resolve paths
    NSBundle *bundle = [NSBundle mainBundle];
    NSString *bundleRes = [bundle resourcePath];
    NSString *bundlePath = [bundle bundlePath];
    NSString *parentDir = [bundlePath stringByDeletingLastPathComponent];
    NSString *grandParentDir = [parentDir stringByDeletingLastPathComponent];
    
    NSFileManager *fm = [NSFileManager defaultManager];
    
    // Project root candidates
    NSString *projectRoot = parentDir;
    if ([fm fileExistsAtPath:[parentDir stringByAppendingPathComponent:@"dashboard.db"]] ||
        [fm fileExistsAtPath:[parentDir stringByAppendingPathComponent:@"data"]]) {
        projectRoot = parentDir;
    } else if ([fm fileExistsAtPath:[grandParentDir stringByAppendingPathComponent:@"dashboard.db"]] ||
               [fm fileExistsAtPath:[grandParentDir stringByAppendingPathComponent:@"data"]]) {
        projectRoot = grandParentDir;
    }
    
    // Locate node
    NSString *nodeBin = findNodeBinary(bundleRes, projectRoot);
    if (!nodeBin) {
        dispatch_async(dispatch_get_main_queue(), ^{
            self.spinner.hidden = YES;
            self.statusLabel.textColor = [NSColor systemRedColor];
            self.statusLabel.stringValue = @"Ошибка: Рантайм Node.js не найден. Установите Node.js 18+ с nodejs.org";
        });
        return;
    }
    
    // Locate server.js
    NSString *serverJs = nil;
    NSString *serverCwd = nil;
    
    NSArray<NSString*> *serverCandidates = @[
        [bundleRes stringByAppendingPathComponent:@"app/server.js"],
        [projectRoot stringByAppendingPathComponent:@"frontend/.next/standalone/server.js"],
        [projectRoot stringByAppendingPathComponent:@"app/server.js"],
        [parentDir stringByAppendingPathComponent:@"app/server.js"]
    ];
    
    for (NSString *cand in serverCandidates) {
        if ([fm fileExistsAtPath:cand]) {
            serverJs = cand;
            serverCwd = [cand stringByDeletingLastPathComponent];
            break;
        }
    }
    
    BOOL useDevServer = NO;
    if (!serverJs) {
        NSString *frontendDir = [projectRoot stringByAppendingPathComponent:@"frontend"];
        if ([fm fileExistsAtPath:[frontendDir stringByAppendingPathComponent:@"package.json"]]) {
            useDevServer = YES;
            serverCwd = frontendDir;
        }
    }
    
    // Locate or create data folder (portable priority)
    NSString *dataDir = nil;
    if ([fm fileExistsAtPath:[projectRoot stringByAppendingPathComponent:@"data"]]) {
        dataDir = [projectRoot stringByAppendingPathComponent:@"data"];
    } else if ([fm fileExistsAtPath:[bundleRes stringByAppendingPathComponent:@"data"]]) {
        dataDir = [bundleRes stringByAppendingPathComponent:@"data"];
    } else {
        NSString *appSupport = [NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES) firstObject];
        dataDir = [appSupport stringByAppendingPathComponent:@"ECommerceDashboard/data"];
        [fm createDirectoryAtPath:dataDir withIntermediateDirectories:YES attributes:nil error:nil];
    }
    
    [fm createDirectoryAtPath:[dataDir stringByAppendingPathComponent:@"ads"] withIntermediateDirectories:YES attributes:nil error:nil];
    [fm createDirectoryAtPath:[dataDir stringByAppendingPathComponent:@"sales"] withIntermediateDirectories:YES attributes:nil error:nil];
    
    NSString *userDb = [dataDir stringByAppendingPathComponent:@"dashboard.db"];
    if (![fm fileExistsAtPath:userDb]) {
        NSString *rootDb = [projectRoot stringByAppendingPathComponent:@"dashboard.db"];
        if ([fm fileExistsAtPath:rootDb]) {
            [fm copyItemAtPath:rootDb toPath:userDb error:nil];
        } else {
            NSString *tmplDb = [bundleRes stringByAppendingPathComponent:@"data/dashboard.db"];
            if ([fm fileExistsAtPath:tmplDb]) {
                [fm copyItemAtPath:tmplDb toPath:userDb error:nil];
            }
        }
    }
    if (![fm fileExistsAtPath:userDb]) {
        NSString *rootDb = [projectRoot stringByAppendingPathComponent:@"dashboard.db"];
        if ([fm fileExistsAtPath:rootDb]) userDb = rootDb;
    }
    
    NSString *userCfg = [dataDir stringByAppendingPathComponent:@"config.json"];
    if (![fm fileExistsAtPath:userCfg]) {
        NSString *rootCfg = [projectRoot stringByAppendingPathComponent:@"config.json"];
        if ([fm fileExistsAtPath:rootCfg]) {
            [fm copyItemAtPath:rootCfg toPath:userCfg error:nil];
        } else {
            NSDictionary *defaultCfg = @{
                @"ads_dir": [dataDir stringByAppendingPathComponent:@"ads"],
                @"sales_dir": [dataDir stringByAppendingPathComponent:@"sales"]
            };
            NSData *cfgData = [NSJSONSerialization dataWithJSONObject:defaultCfg options:NSJSONWritingPrettyPrinted error:nil];
            [cfgData writeToFile:userCfg atomically:YES];
        }
    }
    
    // Locate ETL engine (binary and python script)
    NSString *etlBin = nil;
    NSString *etlScript = nil;
    NSArray<NSString*> *etlCandidates = @[
        [bundleRes stringByAppendingPathComponent:@"etl/sync_local_to_sqlite/sync_local_to_sqlite"],
        [projectRoot stringByAppendingPathComponent:@"dist/sync_local_to_sqlite/sync_local_to_sqlite"],
        [parentDir stringByAppendingPathComponent:@"etl/sync_local_to_sqlite/sync_local_to_sqlite"]
    ];
    for (NSString *e in etlCandidates) {
        BOOL isDir = NO;
        if ([fm fileExistsAtPath:e isDirectory:&isDir] && !isDir && [fm isExecutableFileAtPath:e]) {
            etlBin = e;
            break;
        }
    }

    NSArray<NSString*> *scriptCandidates = @[
        [bundleRes stringByAppendingPathComponent:@"etl/sync_local_to_sqlite.py"],
        [projectRoot stringByAppendingPathComponent:@"sync_local_to_sqlite.py"],
        [parentDir stringByAppendingPathComponent:@"sync_local_to_sqlite.py"]
    ];
    for (NSString *s in scriptCandidates) {
        BOOL isDir = NO;
        if ([fm fileExistsAtPath:s isDirectory:&isDir] && !isDir) {
            etlScript = s;
            break;
        }
    }
    
    dispatch_async(dispatch_get_main_queue(), ^{
        self.statusLabel.stringValue = @"Запуск локального сервера аналитики...";
    });
    
    // Environment variables
    NSMutableDictionary *env = [[[NSProcessInfo processInfo] environment] mutableCopy];
    env[@"PORT"] = @"3000";
    env[@"HOSTNAME"] = @"127.0.0.1";
    env[@"NODE_ENV"] = @"production";
    env[@"DATABASE_PATH"] = userDb;
    env[@"CONFIG_PATH"] = userCfg;
    if (etlBin) env[@"ETL_BIN_PATH"] = etlBin;
    if (etlScript) env[@"ETL_SCRIPT_PATH"] = etlScript;
    
    // Spawn server process
    gServerTask = [[NSTask alloc] init];
    gServerTask.environment = env;
    gServerTask.currentDirectoryPath = serverCwd ? serverCwd : projectRoot;
    
    if (useDevServer) {
        NSString *npmBin = [[nodeBin stringByDeletingLastPathComponent] stringByAppendingPathComponent:@"npm"];
        gServerTask.arguments = @[@"-l", @"-c", [NSString stringWithFormat:@"\"%@\" run dev -- -p 3000 -H 127.0.0.1", npmBin]];
    } else {
        gServerTask.launchPath = nodeBin;
        gServerTask.arguments = @[serverJs];
    }
    
    // Redirect server logs to data/server.log
    NSString *logPath = [dataDir stringByAppendingPathComponent:@"server.log"];
    [[NSFileManager defaultManager] createFileAtPath:logPath contents:nil attributes:nil];
    NSFileHandle *logHandle = [NSFileHandle fileHandleForWritingAtPath:logPath];
    if (logHandle) {
        [logHandle seekToEndOfFile];
        gServerTask.standardOutput = logHandle;
        gServerTask.standardError = logHandle;
    }
    
    NSError *launchErr = nil;
    gServerTask.terminationHandler = ^(NSTask *task) {
        if (!gIsTerminating) {
            gIsTerminating = YES;
            dispatch_async(dispatch_get_main_queue(), ^{
                [NSApp terminate:nil];
            });
        }
    };
    [gServerTask launchAndReturnError:&launchErr];
    if (launchErr) {
        dispatch_async(dispatch_get_main_queue(), ^{
            self.spinner.hidden = YES;
            self.statusLabel.textColor = [NSColor systemRedColor];
            self.statusLabel.stringValue = [NSString stringWithFormat:@"Ошибка запуска сервера: %@", launchErr.localizedDescription];
        });
        return;
    }
    gServerPid = gServerTask.processIdentifier;
    
    // Poll until server responds (up to 40 retries * 500ms = 20s)
    BOOL ready = NO;
    for (int i = 0; i < 40; i++) {
        usleep(500000); // 500ms
        if (isServerResponding(gAppUrl)) {
            ready = YES;
            break;
        }
    }
    
    dispatch_async(dispatch_get_main_queue(), ^{
        if (ready) {
            [self loadWebView];
        } else {
            self.spinner.hidden = YES;
            self.statusLabel.textColor = [NSColor systemRedColor];
            self.statusLabel.stringValue = @"Таймаут: сервер не ответил в течение 20 секунд. Проверьте data/server.log";
        }
    });
}

- (void)loadWebView {
    [self.spinner stopAnimation:nil];
    [self.spinner removeFromSuperview];
    [self.statusLabel removeFromSuperview];
    
    WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
    // Enable Developer Tools (Inspect Element on right-click)
    [config.preferences setValue:@YES forKey:@"developerExtrasEnabled"];
    
    self.webView = [[WKWebView alloc] initWithFrame:self.window.contentView.bounds configuration:config];
    self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.webView.navigationDelegate = self;
    self.webView.UIDelegate = self;
    
    [self.window.contentView addSubview:self.webView];
    
    NSURL *url = [NSURL URLWithString:gAppUrl];
    NSURLRequest *req = [NSURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:10.0];
    [self.webView loadRequest:req];
}

@end

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        AppDelegate *delegate = [[AppDelegate alloc] init];
        app.delegate = delegate;
        [app run];
    }
    return 0;
}
