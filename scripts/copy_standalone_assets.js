const fs = require('fs');
const path = require('path');

// Determine project root and paths
const scriptDir = __dirname;
const projectRoot = path.resolve(scriptDir, '..');
const frontendDir = path.join(projectRoot, 'frontend');
const standaloneDir = path.join(frontendDir, '.next', 'standalone');
const staticDir = path.join(frontendDir, '.next', 'static');
const publicDir = path.join(frontendDir, 'public');

console.log('[Postbuild Assets] Populating standalone directory with static assets...');

if (!fs.existsSync(standaloneDir)) {
  console.log('[Postbuild Assets] Notice: Standalone directory does not exist, skipping.');
  process.exit(0);
}

if (!fs.existsSync(staticDir)) {
  console.error('[Postbuild Assets] Warning: .next/static directory not found!');
  process.exit(0);
}

// 1. Target locations to populate with static assets
const targetStaticLocations = [
  path.join(standaloneDir, '.next', 'static'),
  path.join(standaloneDir, 'static')
];

if (fs.existsSync(path.join(standaloneDir, 'frontend'))) {
  targetStaticLocations.push(path.join(standaloneDir, 'frontend', '.next', 'static'));
  targetStaticLocations.push(path.join(standaloneDir, 'frontend', 'static'));
}

for (const loc of targetStaticLocations) {
  fs.mkdirSync(loc, { recursive: true });
  fs.cpSync(staticDir, loc, { recursive: true, dereference: true });
  console.log(`[Postbuild Assets] Copied static files -> ${path.relative(projectRoot, loc)}`);
}

// 2. Target locations for public directory
const targetPublicLocations = [
  path.join(standaloneDir, 'public')
];

if (fs.existsSync(path.join(standaloneDir, 'frontend'))) {
  targetPublicLocations.push(path.join(standaloneDir, 'frontend', 'public'));
}

if (fs.existsSync(publicDir)) {
  for (const loc of targetPublicLocations) {
    fs.mkdirSync(loc, { recursive: true });
    fs.cpSync(publicDir, loc, { recursive: true, dereference: true });
    console.log(`[Postbuild Assets] Copied public files -> ${path.relative(projectRoot, loc)}`);
  }
}

// 3. Inject Static Asset Serving Hook into standalone server.js files
const serverJsFiles = [
  path.join(standaloneDir, 'server.js'),
  path.join(standaloneDir, 'frontend', 'server.js')
];

const hookMarker = '// STATIC_ASSET_SERVING_HOOK_INJECTED';

const hookCode = `
${hookMarker}
(function() {
  const _http = require('http');
  const _fs = require('fs');
  const _path = require('path');

  const _mimeTypes = {
    '.css': 'text/css; charset=utf-8',
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
        let pathname = decodeURIComponent(parsedUrl.pathname);

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
`;

for (const sPath of serverJsFiles) {
  if (fs.existsSync(sPath)) {
    const content = fs.readFileSync(sPath, 'utf8');
    if (!content.includes(hookMarker)) {
      fs.writeFileSync(sPath, hookCode + '\n' + content, 'utf8');
      console.log(`[Postbuild Assets] Injected static serving hook -> ${path.relative(projectRoot, sPath)}`);
    }
  }
}

// 4. Verify CSS bundles
function findCssFiles(dir) {
  let list = [];
  if (!fs.existsSync(dir)) return list;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      list = list.concat(findCssFiles(full));
    } else if (item.isFile() && item.name.endsWith('.css')) {
      list.push(full);
    }
  }
  return list;
}

const verifiedCss = findCssFiles(path.join(standaloneDir, '.next', 'static'));
if (verifiedCss.length === 0) {
  console.error('[Postbuild Assets] ERROR: No .css files found in standalone static folder!');
  process.exit(1);
}

console.log(`[Postbuild Assets] ✓ Successfully verified ${verifiedCss.length} CSS bundle(s) in standalone package.`);
