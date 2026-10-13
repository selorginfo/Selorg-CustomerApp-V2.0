/**
 * Reverse Metro ports on connected devices, then install on one target.
 *
 * Override with: ANDROID_SERIAL=<id>   or   DEVICE_ID=<id>
 * Brand / variant: SELORG_BRAND=selorg (default)   SELORG_VARIANT=Debug (default)
 */
const { execSync, spawnSync } = require('child_process');
const path = require('path');

const PORT = Number(process.env.RCT_METRO_PORT || process.env.METRO_PORT || 8082);
const API_PORT = Number(process.env.SELORG_API_PORT || 3333);

// Gradle flavor names cannot contain hyphens: partner-a -> partnerA.
const brandArg = (process.argv.find(a => a.startsWith('--brand=')) || '').slice('--brand='.length);
const BRAND = (brandArg || process.env.SELORG_BRAND || 'selorg').trim();
const VARIANT = (process.env.SELORG_VARIANT || 'Debug').trim();
const FLAVOR = BRAND.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const MODE = `${FLAVOR}${VARIANT.charAt(0).toUpperCase()}${VARIANT.slice(1)}`;

// Metro serves whichever brand select-brand.js last activated; installing a
// different brand's native shell would run one brand's JS inside the other's app.
function assertBrandMatches() {
  const fs = require('fs');
  const root = path.join(__dirname, '..');
  const generated = path.join(root, 'src', 'brands', 'active.generated.ts');
  const active = fs.existsSync(generated)
    ? (/ACTIVE_BRAND_KEY\s*=\s*'([^']+)'/.exec(fs.readFileSync(generated, 'utf8')) || [])[1]
    : 'selorg';
  if (active !== BRAND) {
    console.error(
      `Active JS brand is "${active}" but SELORG_BRAND is "${BRAND}". ` +
        `Run: npm run brand -- ${BRAND} <mode>   (or set SELORG_BRAND=${active})`,
    );
    process.exit(1);
  }
  const nativeFile = path.join(root, 'src', 'brands', BRAND, 'native.json');
  const native = fs.existsSync(nativeFile) ? JSON.parse(fs.readFileSync(nativeFile, 'utf8')) : {};
  if (!native.androidApplicationId) {
    console.error(`Brand "${BRAND}" has no Android application ID yet; it cannot be installed.`);
    process.exit(1);
  }
  return native.androidApplicationId;
}
const APP_ID = assertBrandMatches();

function listDevices() {
  const out = execSync('adb devices', { encoding: 'utf8' });
  return out
    .split(/\r?\n/)
    .slice(1)
    .map(line => line.replace(/\r$/, ''))
    .filter(line => line.includes('\t'))
    .map(line => {
      const [id, status] = line.split('\t');
      return { id: (id || '').trim(), status: (status || '').trim() };
    })
    .filter(d => d.id && d.status === 'device')
    .map(d => d.id);
}

function quoteForCmd(value) {
  // Escape for cmd.exe when shell:true is required on Windows.
  return `"${String(value).replace(/"/g, '""')}"`;
}

function scoreDevice(id) {
  let score = 0;
  // Prefer physical USB devices; deprioritize wireless ADB (flaky large APK installs).
  if (id.startsWith('emulator-')) score -= 20;
  if (id.includes(' ')) score -= 50;
  if (id.includes('_adb-tls-connect')) score -= 10;
  if (/^[A-Z0-9]+$/i.test(id)) score += 30;
  // Prefer the non-16KB Selorg AVD when multiple emulators are up.
  // The google_apis_playstore_ps16k image shows a blocking
  // "Android App Compatibility" dialog that looks like a black-screen crash.
  try {
    const name = execSync(`adb -s ${quoteForCmd(id)} emu avd name`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    })
      .toString()
      .trim();
    if (/Selorg_API36/i.test(name)) score += 40;
    if (/16k|ps16k/i.test(name)) score -= 40;
  } catch {
    // emu avd name only works for emulators; ignore for physical devices
  }
  return score;
}

function pickDevice(devices) {
  const forced = (process.env.ANDROID_SERIAL || process.env.DEVICE_ID || '').trim();
  if (forced) {
    if (devices.includes(forced)) return forced;
    console.warn(
      `Configured device "${forced}" is not connected. Connected: ${devices.join(' | ') || '(none)'}`,
    );
    console.warn('Falling back to an available device…');
  }
  if (devices.length === 0) {
    console.error('No Android devices/emulators connected. Plug in a phone or start an emulator.');
    process.exit(1);
  }
  return [...devices].sort((a, b) => scoreDevice(b) - scoreDevice(a))[0];
}

function reversePorts(devices) {
  for (const id of devices) {
    try {
      execSync(`adb -s ${quoteForCmd(id)} reverse tcp:${PORT} tcp:${PORT}`, {
        stdio: 'inherit',
        shell: true,
      });
      // selorg-service (the customer API) listens on 3333; without this the
      // app's localhost candidate is refused and it silently falls back to the
      // remote dev-api host, so local backend changes never reach the device.
      execSync(`adb -s ${quoteForCmd(id)} reverse tcp:${API_PORT} tcp:${API_PORT}`, {
        stdio: 'inherit',
        shell: true,
      });
      execSync(`adb -s ${quoteForCmd(id)} reverse tcp:4000 tcp:4000`, {
        stdio: 'inherit',
        shell: true,
      });
      // Emulator reaches host Metro via adb reverse → localhost.
      // Physical devices need the host LAN IP if reverse is unavailable.
      const host = id.startsWith('emulator-') ? `localhost:${PORT}` : '';
      if (host) {
        execSync(
          `adb -s ${quoteForCmd(id)} shell settings put global debug_http_host ${host}`,
          { stdio: 'inherit', shell: true },
        );
      }
    } catch {
      console.warn(`adb reverse failed for ${id} (continuing)`);
    }
  }
}

let devices = listDevices();
let target = pickDevice(devices);
reversePorts(devices);

devices = listDevices();
if (!devices.includes(target)) {
  console.warn(`Device "${target}" disappeared. Re-selecting…`);
  target = pickDevice(devices);
}

console.log(`Installing ${MODE} on: ${target}`);
if (devices.length > 1) {
  console.log(`Other devices: ${devices.filter(d => d !== target).join(' | ')}`);
  console.log('Override with: $env:ANDROID_SERIAL="<device-id>"; npm run android');
}

// Invoke the local RN CLI via node (avoids Windows npx.cmd spawn EINVAL).
const cliJs = path.join(__dirname, '..', 'node_modules', '@react-native-community', 'cli', 'build', 'bin.js');
const fallbackCli = path.join(__dirname, '..', 'node_modules', 'react-native', 'cli.js');
const cliPath = require('fs').existsSync(cliJs) ? cliJs : fallbackCli;

const result = spawnSync(
  process.execPath,
  [cliPath, 'run-android', `--mode=${MODE}`, `--appId=${APP_ID}`, `--deviceId=${target}`, `--port=${PORT}`],
  {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ANDROID_SERIAL: target, RCT_METRO_PORT: String(PORT) },
    cwd: path.join(__dirname, '..'),
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
