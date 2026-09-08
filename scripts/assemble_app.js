const fs = require('fs');
const path = require('path');

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
  console.error(`[Error] Standalone directory does not exist: ${standaloneDir}`);
  console.error('Please run "npm run build" in frontend directory first.');
  process.exit(1);
}

console.log(`[Assemble] Packaging Standalone server into: ${appTarget}`);
fs.mkdirSync(appTarget, { recursive: true });

// 1. Copy full standalone bundle (including hidden .next directory)
fs.cpSync(standaloneDir, appTarget, { recursive: true });

// 2. Copy static files into .next/static (CSS, JS chunks, fonts, media)
const targetStatic = path.join(appTarget, '.next', 'static');
console.log(`[Assemble] Packaging Static assets into: ${targetStatic}`);
fs.mkdirSync(targetStatic, { recursive: true });
fs.cpSync(staticDir, targetStatic, { recursive: true });

// 3. Copy public directory if exists
if (fs.existsSync(publicDir)) {
  const targetPublic = path.join(appTarget, 'public');
  console.log(`[Assemble] Packaging Public assets into: ${targetPublic}`);
  fs.mkdirSync(targetPublic, { recursive: true });
  fs.cpSync(publicDir, targetPublic, { recursive: true });
}

// 4. Verify CSS files presence
const chunksDir = path.join(targetStatic, 'chunks');
if (fs.existsSync(chunksDir)) {
  const cssFiles = fs.readdirSync(chunksDir).filter(f => f.endsWith('.css'));
  if (cssFiles.length > 0) {
    console.log(`[Assemble] ✓ Success: ${cssFiles.length} CSS bundle(s) found: ${cssFiles.join(', ')}`);
  } else {
    console.warn('[Assemble] ⚠️ Warning: No .css files found in chunks directory!');
  }
} else {
  console.warn('[Assemble] ⚠️ Warning: chunks directory not found in .next/static!');
}

console.log('[Assemble] ✓ Standalone Next.js application successfully assembled!');
