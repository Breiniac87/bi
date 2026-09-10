const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetAppDir = process.argv[2];
if (!targetAppDir) {
  console.error('Usage: node scripts/assemble_app.js <target_app_directory>');
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..');
const standaloneDir = path.join(projectRoot, 'frontend', '.next', 'standalone');
const staticDir = path.join(projectRoot, 'frontend', '.next', 'static');
const publicDir = path.join(projectRoot, 'frontend', 'public');
const appTarget = path.resolve(targetAppDir);

if (!fs.existsSync(standaloneDir)) {
  console.error(`[Assemble Error] Standalone directory does not exist: ${standaloneDir}`);
  console.error('Please run "npm run build" in frontend directory first.');
  process.exit(1);
}

if (!fs.existsSync(staticDir)) {
  console.error(`[Assemble Error] Static directory does not exist: ${staticDir}`);
  process.exit(1);
}

console.log(`[Assemble] Packaging Standalone server into: ${appTarget}`);
fs.mkdirSync(appTarget, { recursive: true });

// 1. Determine if standalone structure is nested (monorepo tracing) or flat
let sourceStandaloneDir = standaloneDir;
if (!fs.existsSync(path.join(standaloneDir, 'server.js')) && fs.existsSync(path.join(standaloneDir, 'frontend', 'server.js'))) {
  console.log('[Assemble] Notice: Nested standalone structure detected. Flattening to app root...');
  sourceStandaloneDir = path.join(standaloneDir, 'frontend');
  const outerNodeModules = path.join(standaloneDir, 'node_modules');
  const targetNodeModules = path.join(appTarget, 'node_modules');
  if (fs.existsSync(outerNodeModules)) {
    console.log('[Assemble] Copying shared node_modules from outer standalone directory...');
    fs.cpSync(outerNodeModules, targetNodeModules, { recursive: true, dereference: true });
  }
}

// 2. Copy full standalone bundle (including hidden .next directory and server.js)
console.log(`[Assemble] Copying standalone runtime from: ${sourceStandaloneDir}`);
fs.cpSync(sourceStandaloneDir, appTarget, { recursive: true, dereference: true });

// 3. Copy static files into:
//    a) .next/static (standard Next.js standalone location)
//    b) static (non-dot directory so zip archivers like Compress-Archive NEVER skip it)
const locationsToPopulate = [
  path.join(appTarget, '.next', 'static'),
  path.join(appTarget, 'static')
];

if (fs.existsSync(path.join(appTarget, 'frontend'))) {
  locationsToPopulate.push(path.join(appTarget, 'frontend', '.next', 'static'));
  locationsToPopulate.push(path.join(appTarget, 'frontend', 'static'));
}

for (const loc of locationsToPopulate) {
  console.log(`[Assemble] Packaging static assets into: ${loc}`);
  fs.mkdirSync(loc, { recursive: true });
  fs.cpSync(staticDir, loc, { recursive: true, dereference: true });
}

// 4. Copy public directory if exists
if (fs.existsSync(publicDir)) {
  const targetPublicLocations = [
    path.join(appTarget, 'public')
  ];
  if (fs.existsSync(path.join(appTarget, 'frontend'))) {
    targetPublicLocations.push(path.join(appTarget, 'frontend', 'public'));
  }
  for (const targetPublic of targetPublicLocations) {
    console.log(`[Assemble] Packaging Public assets into: ${targetPublic}`);
    fs.mkdirSync(targetPublic, { recursive: true });
    fs.cpSync(publicDir, targetPublic, { recursive: true, dereference: true });
  }
}

// 5. On Windows, explicitly remove Hidden / System attributes from all assembled files
// This ensures archivers like Compress-Archive and Windows Explorer never skip .next or static files
if (process.platform === 'win32') {
  try {
    console.log('[Assemble] Stripping hidden/system file attributes across entire bundle...');
    execSync(`powershell -NoProfile -Command "Get-ChildItem -Path '${path.resolve(appTarget)}' -Recurse -Force | ForEach-Object { $_.Attributes = 'Normal' }"`, { stdio: 'ignore' });
    execSync(`powershell -NoProfile -Command "(Get-Item -Path '${path.resolve(appTarget)}' -Force).Attributes = 'Normal'"`, { stdio: 'ignore' });
    const dotNext = path.join(appTarget, '.next');
    if (fs.existsSync(dotNext)) {
      execSync(`powershell -NoProfile -Command "(Get-Item -Path '${path.resolve(dotNext)}' -Force).Attributes = 'Normal'"`, { stdio: 'ignore' });
    }
  } catch (e) {
    try {
      execSync(`attrib -h -s "${appTarget}\\*" /s /d`, { stdio: 'ignore' });
      execSync(`attrib -h -s "${appTarget}\\.next" /s /d`, { stdio: 'ignore' });
      execSync(`attrib -h -s "${appTarget}\\.next\\*" /s /d`, { stdio: 'ignore' });
    } catch (_) {}
  }
}

// 6. Inject High-Reliability Static Asset Serving Hook into server.js
// This intercepts requests to /_next/static/* and serves files directly with correct MIME types
// from either 'static' or '.next/static', guaranteeing styles work regardless of archiver/routing quirks.
const serverFilesToPatch = [
  path.join(appTarget, 'server.js'),
  path.join(appTarget, 'frontend', 'server.js')
];

const hookMarker = '// STATIC_ASSET_SERVING_HOOK_INJECTED';

const hookCode = `
${hookMarker}
// ============================================================================
// HIGH-RELIABILITY STATIC ASSET SERVING HOOK (E-COMMERCE DASHBOARD PORTABLE)
// Guarantees CSS, JS chunks, and media are served immediately with correct MIME types
// ============================================================================
(function() {
  const _http = require('http');
  const _fs = require('fs');
  const _path = require('path');

  const _mimeTypes = {
    '.css': 'text/css',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf'
  };

  function serveFile(filePath, req, res) {
    try {
      const ext = _path.extname(filePath).toLowerCase();
      const stat = _fs.statSync(filePath);
      res.setHeader('Content-Type', _mimeTypes[ext] || 'application/octet-stream');
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      if (req.method === 'HEAD') {
        return res.end();
      }
      const stream = _fs.createReadStream(filePath);
      stream.on('error', function(err) {
        if (!res.headersSent) {
          res.statusCode = 500;
        }
        res.end();
      });
      return stream.pipe(res);
    } catch (e) {
      // Fall through if file read fails
    }
  }

  const _origCreateServer = _http.createServer;
  _http.createServer = function(...args) {
    const origListener = typeof args[0] === 'function' ? args[0] : args[1];
    const wrappedListener = function(req, res) {
      try {
        const reqUrl = req.url || '/';
        const parsedUrl = new URL(reqUrl, 'http://127.0.0.1:3000');
        let pathname = decodeURIComponent(parsedUrl.pathname).replace(/\\/g, '/');

        // A. Handle /_next/static/*
        if (pathname.startsWith('/_next/static/')) {
          const subPath = pathname.substring('/_next/static/'.length);
          const candidatePaths = [
            _path.join(__dirname, 'static', subPath),
            _path.join(__dirname, '.next', 'static', subPath),
            _path.join(__dirname, 'frontend', 'static', subPath),
            _path.join(__dirname, 'frontend', '.next', 'static', subPath)
          ];

          for (const filePath of candidatePaths) {
            if (_fs.existsSync(filePath) && _fs.statSync(filePath).isFile()) {
              return serveFile(filePath, req, res);
            }
          }
        }

        // B. Handle root public assets (/favicon.ico, /icon.png, /public/*)
        if (pathname === '/favicon.ico' || pathname === '/icon.png' || pathname.startsWith('/public/')) {
          const relPath = pathname.startsWith('/public/') ? pathname.substring('/public/'.length) : pathname.substring(1);
          const candidatePaths = [
            _path.join(__dirname, 'public', relPath),
            _path.join(__dirname, relPath),
            _path.join(__dirname, 'frontend', 'public', relPath)
          ];

          for (const filePath of candidatePaths) {
            if (_fs.existsSync(filePath) && _fs.statSync(filePath).isFile()) {
              return serveFile(filePath, req, res);
            }
          }
        }
      } catch (err) {
        console.error('[StaticHook] Error:', err);
      }

      if (typeof origListener === 'function') {
        return origListener(req, res);
      }
    };

    if (typeof args[0] === 'function') {
      args[0] = wrappedListener;
    } else if (typeof args[1] === 'function') {
      args[1] = wrappedListener;
    }
    return _origCreateServer.apply(this, args);
  };
})();
// ============================================================================
`;

for (const serverJsPath of serverFilesToPatch) {
  if (fs.existsSync(serverJsPath)) {
    const originalServerCode = fs.readFileSync(serverJsPath, 'utf8');
    if (!originalServerCode.includes(hookMarker)) {
      console.log(`[Assemble] Injecting static asset server hook into ${path.basename(serverJsPath)}...`);
      fs.writeFileSync(serverJsPath, hookCode + '\n' + originalServerCode, 'utf8');
      console.log(`[Assemble] ✓ Static asset hook successfully injected into ${path.basename(serverJsPath)}.`);
    }
  }
}

// 7. Recursively verify all CSS bundles in both .next/static and static
function findFilesRecursive(dir, ext) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findFilesRecursive(full, ext));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

const verifiedStaticDir = path.join(appTarget, 'static');
const cssBundles = findFilesRecursive(verifiedStaticDir, '.css');
if (cssBundles.length === 0) {
  console.error('[Assemble Error] CRITICAL: No .css files found in static assets!');
  console.error('The application will render without styles if packaged. Aborting build.');
  process.exit(1);
}

console.log(`[Assemble] ✓ Success: ${cssBundles.length} CSS bundle(s) verified in package:`);
for (const css of cssBundles) {
  const rel = path.relative(appTarget, css);
  const size = fs.statSync(css).size;
  console.log(`   - ${rel} (${size} bytes)`);
}

console.log('[Assemble] ✓ Standalone Next.js application successfully assembled with guaranteed styles!');
