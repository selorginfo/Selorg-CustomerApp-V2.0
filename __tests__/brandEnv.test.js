/**
 * Runs the real scripts/select-brand.js against a throwaway copy of the project layout, so the
 * repository's own .env and generated files are never touched.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const brandEnv = require('../scripts/brand-env');

const SCRIPTS = path.join(__dirname, '..', 'scripts');
const SELORG_ENV = [
  'APP_MODE=development',
  'PAYMENT_STANDALONE_MODE=false',
  'PAYMENT_API_BASE_URL=https://api.selorg.com',
  'GOOGLE_MAPS_API_KEY=selorg-maps-key',
  'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=selorg-maps-key',
  'EAS_PROJECT_ID=selorg-eas',
  'API_BASE_URL=https://dev-api.selorg.com/api/v1/customer',
  'DEV_API_BASE_URL=https://dev-api.selorg.com/api/v1/customer',
  'PROD_API_BASE_URL=https://api.selorg.com/api/v1/customer',
].join('\n');
const SODAKKU_PROD = [
  'BRAND_KEY=sodakku',
  'APP_MODE=production',
  'PROD_API_BASE_URL=https://api.sodakku.example/api/v1/customer',
  'API_BASE_URL=https://api.sodakku.example/api/v1/customer',
  'GOOGLE_MAPS_API_KEY=sodakku-maps-key',
  'PAYMENT_STANDALONE_MODE=',
].join('\n');

function makeProject({ sodakkuProd = SODAKKU_PROD } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'customer-brand-'));
  fs.mkdirSync(path.join(root, 'scripts'));
  for (const f of ['select-brand.js', 'brand-env.js']) fs.copyFileSync(path.join(SCRIPTS, f), path.join(root, 'scripts', f));
  for (const b of ['selorg', 'sodakku']) fs.mkdirSync(path.join(root, 'src', 'brands', b), { recursive: true });
  fs.mkdirSync(path.join(root, 'env', 'sodakku'), { recursive: true });
  fs.writeFileSync(path.join(root, '.env'), SELORG_ENV);
  fs.writeFileSync(path.join(root, '.env.development'), SELORG_ENV);
  if (sodakkuProd !== null) fs.writeFileSync(path.join(root, 'env', 'sodakku', '.env.production'), sodakkuProd);
  return root;
}

const run = (root, ...args) =>
  spawnSync(process.execPath, [path.join(root, 'scripts', 'select-brand.js'), ...args], { cwd: root, encoding: 'utf8' });
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (root, rel) => fs.existsSync(path.join(root, rel));

const roots = [];
afterAll(() => roots.forEach(r => fs.rmSync(r, { recursive: true, force: true })));
const project = opts => {
  const r = makeProject(opts);
  roots.push(r);
  return r;
};

describe('select-brand for a partner', () => {
  it('never writes the Selorg .env and writes the resolved partner file', () => {
    const root = project();
    const before = read(root, '.env');
    const res = run(root, 'sodakku', 'production');
    expect(res.status).toBe(0);
    expect(read(root, '.env')).toBe(before);
    const resolved = brandEnv.parseEnv(read(root, 'env/sodakku/.env.resolved'));
    expect(resolved.BRAND_KEY).toBe('sodakku');
    expect(resolved.PROD_API_BASE_URL).toBe('https://api.sodakku.example/api/v1/customer');
    expect(resolved.GOOGLE_MAPS_API_KEY).toBe('sodakku-maps-key');
    expect(resolved.PAYMENT_API_BASE_URL).toBe('https://api.selorg.com');
    expect(read(root, 'src/brands/active.generated.ts')).toContain("ACTIVE_BRAND_KEY = 'sodakku'");
  });

  it('inherits Maps and the payment API from Selorg, never customer origins or project ids', () => {
    const root = project({ sodakkuProd: 'BRAND_KEY=sodakku\nAPP_MODE=production\nPROD_API_BASE_URL=https://api.sodakku.example/api/v1/customer\n' });
    expect(run(root, 'sodakku', 'production').status).toBe(0);
    const resolved = brandEnv.parseEnv(read(root, 'env/sodakku/.env.resolved'));
    expect(resolved.PAYMENT_STANDALONE_MODE).toBe('false');
    expect(resolved.GOOGLE_MAPS_API_KEY).toBe('selorg-maps-key');
    expect(resolved.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY).toBe('selorg-maps-key');
    expect(resolved.PAYMENT_API_BASE_URL).toBe('https://api.selorg.com');
    for (const k of ['EAS_PROJECT_ID', 'API_BASE_URL', 'DEV_API_BASE_URL']) expect(resolved[k]).toBeUndefined();
  });

  it('a blank value counts as missing and is not inherited unless brand-neutral', () => {
    const root = project({ sodakkuProd: 'BRAND_KEY=sodakku\nAPP_MODE=production\nPROD_API_BASE_URL=\nAPI_BASE_URL=\n' });
    const res = run(root, 'sodakku', 'production');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('PROD_API_BASE_URL or API_BASE_URL is required');
    expect(exists(root, 'env/sodakku/.env.resolved')).toBe(false);
    expect(exists(root, 'src/brands/active.generated.ts')).toBe(false);
  });

  it('refuses Selorg hosts and copied Selorg values without printing them', () => {
    const root = project({
      sodakkuProd: 'BRAND_KEY=sodakku\nAPP_MODE=production\nPROD_API_BASE_URL=https://api.selorg.com/api/v1/customer\nGOOGLE_MAPS_API_KEY=selorg-maps-key\n',
    });
    const res = run(root, 'sodakku', 'production');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('PROD_API_BASE_URL points at a Selorg host');
    expect(res.stderr).not.toContain('GOOGLE_MAPS_API_KEY reuses the Selorg value');
    expect(res.stderr).not.toContain('selorg-maps-key');
    expect(res.stderr).not.toContain('api.selorg.com');
  });

  it('refuses a missing partner file instead of falling back to Selorg', () => {
    const root = project({ sodakkuProd: null });
    const res = run(root, 'sodakku', 'production');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('nothing is inherited from Selorg');
  });

  it('refuses a wrong BRAND_KEY, http or loopback production URLs', () => {
    const wrong = project({ sodakkuProd: SODAKKU_PROD.replace('BRAND_KEY=sodakku', 'BRAND_KEY=selorg') });
    expect(run(wrong, 'sodakku', 'production').stderr).toContain('BRAND_KEY must be "sodakku"');
    const http = project({ sodakkuProd: SODAKKU_PROD.replace(/https:\/\/api\.sodakku\.example/g, 'http://localhost:3333') });
    expect(run(http, 'sodakku', 'production').stderr).toContain('must be a public https URL in production');
  });
});

describe('select-brand for Selorg', () => {
  it('keeps the existing behaviour: .env comes from the Selorg mode file', () => {
    const root = project();
    expect(run(root, 'selorg', 'development').status).toBe(0);
    expect(read(root, '.env')).toBe(SELORG_ENV);
    expect(read(root, 'src/brands/active.generated.ts')).toContain("ACTIVE_BRAND_KEY = 'selorg'");
  });

  it('still refuses to overwrite a hand-edited .env', () => {
    const root = project();
    fs.writeFileSync(path.join(root, '.env'), `${SELORG_ENV}\nLOCAL_EDIT=1`);
    const res = run(root, 'selorg', 'development');
    expect(res.status).toBe(1);
    expect(read(root, '.env')).toContain('LOCAL_EDIT=1');
  });
});

describe('activeDotenvPath (what Babel inlines)', () => {
  it('is .env for Selorg and the resolved file for a partner', () => {
    const root = project();
    expect(brandEnv.activeDotenvPath(root)).toBe(path.join(root, '.env'));
    run(root, 'sodakku', 'production');
    expect(brandEnv.activeDotenvPath(root)).toBe(path.join(root, 'env', 'sodakku', '.env.resolved'));
  });

  it('throws for an active partner that was never resolved', () => {
    const root = project();
    fs.writeFileSync(path.join(root, 'src', 'brands', 'active.generated.ts'), "export const ACTIVE_BRAND_KEY = 'sodakku';\n");
    expect(() => brandEnv.activeDotenvPath(root)).toThrow(/env\/sodakku\/\.env\.resolved is missing/);
  });
});

describe('parseEnv', () => {
  it('handles quotes, export and inline comments', () => {
    expect(brandEnv.parseEnv('export A="x y"\nB=1 # note\nC=\'q\'\n# D=no')).toEqual({ A: 'x y', B: '1', C: 'q' });
  });
});
