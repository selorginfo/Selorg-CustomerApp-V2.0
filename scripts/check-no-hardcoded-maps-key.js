/**
 * Fails if tracked source/config contains a Google API key literal (AIzaSy…).
 * Firebase client config files are allowed — those keys are package-restricted
 * client identifiers, not the Maps server/mobile Maps SDK secret this check guards.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const KEY_RE = /AIzaSy[A-Za-z0-9_-]{20,}/;
const SKIP_DIR = new Set(['node_modules', '.git', 'android', 'ios', 'build', 'dist', 'coverage', '.expo']);
const ALLOW_BASENAME = new Set(['google-services.json', 'GoogleService-Info.plist']);
const SCAN_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.env',
  '.example',
  '.gradle',
  '.properties',
  '.plist',
  '.xml',
  '.txt',
]);

function shouldScan(filePath) {
  const base = path.basename(filePath);
  if (ALLOW_BASENAME.has(base)) return false;
  if (base === '.env' || base.startsWith('.env.')) {
    return base.includes('example') || base.endsWith('.sample');
  }
  const ext = path.extname(filePath);
  if (base.endsWith('.env.example') || base.endsWith('Secrets.xcconfig.example')) return true;
  return SCAN_EXT.has(ext) || base === '.env.example';
}

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIR.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (shouldScan(full)) out.push(full);
  }
}

function main() {
  const files = [];
  walk(ROOT, files);
  const offenders = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (KEY_RE.test(text)) {
      offenders.push(path.relative(ROOT, file).replace(/\\/g, '/'));
    }
  }
  if (offenders.length) {
    console.error('Hardcoded Google API key pattern found in:');
    offenders.forEach((f) => console.error(`  - ${f}`));
    console.error('Use env placeholders (your-google-maps-api-key) only. Do not commit real keys.');
    process.exit(1);
  }
  console.log(`OK: no hardcoded Google API key literals in ${files.length} scanned files.`);
}

if (require.main === module) main();

module.exports = { KEY_RE, shouldScan, main };
