/**
 * Start Metro with Windows-friendly defaults.
 * Usage: node scripts/start-metro.js [--reset-cache]
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const root = path.join(__dirname, '..');
const resetCache = process.argv.includes('--reset-cache');
const PORT = 8081;

function isPortFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}

function killPortOccupants(port) {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync(`netstat -ano | findstr ":${port}" | findstr LISTENING`, {
      encoding: 'utf8',
    });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().match(/(\d+)\s*$/);
      if (m) pids.add(m[1]);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
        console.log(`[start-metro] Freed port ${port} (killed pid ${pid})`);
      } catch {
        // ignore
      }
    }
  } catch {
    // nothing listening
  }
}

async function main() {
  if (!(await isPortFree(PORT))) {
    console.warn(`[start-metro] Port ${PORT} busy — clearing stale Metro…`);
    killPortOccupants(PORT);
    await new Promise(r => setTimeout(r, 800));
  }

  const cliJs = path.join(
    root,
    'node_modules',
    '@react-native-community',
    'cli',
    'build',
    'bin.js',
  );
  const fallbackCli = path.join(root, 'node_modules', 'react-native', 'cli.js');
  const cliPath = fs.existsSync(cliJs) ? cliJs : fallbackCli;

  const args = [cliPath, 'start', '--port', String(PORT)];
  if (resetCache) {
    args.push('--reset-cache');
  }

  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      // Prefer Node polling when native recursive watchers are unreliable.
      CHOKIDAR_USEPOLLING: process.env.CHOKIDAR_USEPOLLING || '1',
    },
  });

  child.on('exit', code => {
    process.exit(code ?? 1);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
