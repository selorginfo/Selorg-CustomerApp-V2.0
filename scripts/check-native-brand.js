/**
 * Read-only check that the native Android / iOS identity matches a brand's
 * src/brands/<brand>/native.json. Changes nothing; exits 1 on any mismatch.
 *
 *   node scripts/check-native-brand.js            # selorg
 *   node scripts/check-native-brand.js <brand>
 *
 * Firebase files are only read for package / bundle / project ids — never keys.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const brand = process.argv[2] || process.env.SELORG_BRAND || 'selorg';
const nativePath = path.join(ROOT, 'src', 'brands', brand, 'native.json');

if (!fs.existsSync(nativePath)) {
  console.error(`[native] No ${path.relative(ROOT, nativePath)} for brand "${brand}".`);
  process.exit(1);
}
const expected = JSON.parse(fs.readFileSync(nativePath, 'utf8'));
const flavor = expected.androidFlavor;

const read = rel => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};
const results = [];
const check = (label, actual, want) =>
  want == null
    ? results.push({ label, ok: false, actual: actual ?? '(missing)', want: '(not provided in native.json)' })
    : results.push({ label, ok: actual === want, actual: actual ?? '(missing)', want });
const note = (label, message) => results.push({ label, ok: true, note: message });
const fail = (label, message) => results.push({ label, ok: false, actual: message, want: '-' });

const DEFAULT_BRAND = 'selorg';
const partner = brand !== DEFAULT_BRAND;
if (partner) {
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'brands', DEFAULT_BRAND, 'native.json'), 'utf8'));
  for (const key of ['androidApplicationId', 'iosBundleId', 'firebaseProjectId']) {
    if (expected[key] != null && expected[key] === base[key]) {
      fail(`${key} reuse`, `"${expected[key]}" belongs to ${DEFAULT_BRAND}`);
    }
  }
}

// Android
const gradle = read('android/app/build.gradle') || '';
const flavorBlock = gradle.match(new RegExp(`productFlavors\\s*\\{[\\s\\S]*?\\b${flavor}\\s*\\{([\\s\\S]*?)\\}`));
check(
  `android flavor "${flavor}" applicationId`,
  flavorBlock && (flavorBlock[1].match(/applicationId\s+"([^"]+)"/) || [])[1],
  expected.androidApplicationId,
);
const flavorRes = `android/app/src/${flavor}/res/values/strings.xml`;
const strings = read(flavorRes) || (partner ? '' : read('android/app/src/main/res/values/strings.xml')) || '';
check(partner ? `${flavorRes} app_name` : 'android app_name', (strings.match(/name="app_name">([^<]*)</) || [])[1], expected.displayName);

// The app-root google-services.json is Selorg's; partners need their own per flavor.
const gsRel =
  partner || fs.existsSync(path.join(ROOT, `android/app/src/${flavor}/google-services.json`))
    ? `android/app/src/${flavor}/google-services.json`
    : 'android/app/google-services.json';
const gsRaw = read(gsRel);
if (gsRaw) {
  const gs = JSON.parse(gsRaw);
  const packages = (gs.client || []).map(c => c.client_info?.android_client_info?.package_name);
  check(`${gsRel} project_id`, gs.project_info?.project_id, expected.firebaseProjectId);
  check(
    `${gsRel} has package`,
    packages.includes(expected.androidApplicationId) ? expected.androidApplicationId : packages.join(', '),
    expected.androidApplicationId,
  );
} else {
  check(gsRel, null, 'present');
}

const pbx = read('ios/Selorg.xcodeproj/project.pbxproj') || '';

// iOS partner brands are <Brand>-Debug / <Brand>-Release configurations of the
// single Selorg target, built with the <Brand> scheme.
if (partner) {
  const Brand = brand.charAt(0).toUpperCase() + brand.slice(1);
  const blocks = [...pbx.matchAll(/\/\* [^*]+ \*\/ = \{\n\t\t\tisa = XCBuildConfiguration;[\s\S]*?\n\t\t\};/g)]
    .map(m => m[0])
    .filter(b => b.includes(`name = "${Brand}-`) && b.includes('PRODUCT_BUNDLE_IDENTIFIER'));
  const setting = key => [...new Set(blocks.map(b => (b.match(new RegExp(`${key} = "?([^";]+)"?;`)) || [])[1]))].join(', ') || null;
  check(`ios ${Brand}-* configurations`, blocks.length === 2 ? 'Debug, Release' : `${blocks.length} found`, 'Debug, Release');
  check(`ios ${Brand}-* PRODUCT_BUNDLE_IDENTIFIER`, setting('PRODUCT_BUNDLE_IDENTIFIER'), expected.iosBundleId);
  check(`ios ${Brand}-* BRAND_DISPLAY_NAME`, setting('BRAND_DISPLAY_NAME'), expected.displayName);
  check(`ios ${Brand}.xcscheme`, read(`ios/Selorg.xcodeproj/xcshareddata/xcschemes/${Brand}.xcscheme`) ? 'present' : null, 'present');
  const iconSet = `ios/Selorg/Images.xcassets/AppIcon-${Brand}.appiconset`;
  const iconFiles = fs.existsSync(path.join(ROOT, iconSet)) ? fs.readdirSync(path.join(ROOT, iconSet)).filter(f => f.endsWith('.png')) : [];
  check(`${iconSet} images`, iconFiles.length ? 'present' : null, 'present');
  const plistRel = setting('BRAND_GOOGLE_SERVICE_PLIST');
  const brandGsi = plistRel && read(`ios/${plistRel}`);
  if (brandGsi) {
    const val = key => (brandGsi.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`)) || [])[1];
    check(`ios/${plistRel} BUNDLE_ID`, val('BUNDLE_ID'), expected.iosBundleId);
    check(`ios/${plistRel} PROJECT_ID`, val('PROJECT_ID'), expected.firebaseProjectId);
  } else {
    check('ios brand GoogleService-Info.plist', null, 'present');
  }
  report();
}

// iOS
const selorgConfigs = [...pbx.matchAll(/\/\* (Debug|Release) \*\/ = \{\n\t\t\tisa = XCBuildConfiguration;[\s\S]*?\n\t\t\};/g)].map(m => m[0]);
const bundleIds = [
  ...new Set(selorgConfigs.flatMap(b => [...b.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;/g)].map(m => m[1]))),
];
check('ios PRODUCT_BUNDLE_IDENTIFIER', bundleIds.join(', ') || null, expected.iosBundleId);

const plist = read('ios/Selorg/Info.plist') || '';
let displayName = (plist.match(/<key>CFBundleDisplayName<\/key>\s*<string>([^<]*)<\/string>/) || [])[1];
const settingRef = displayName && (displayName.match(/^\$\((\w+)\)$/) || [])[1];
if (settingRef) {
  const selorgBlocks = [...pbx.matchAll(/\/\* (Debug|Release) \*\/ = \{\n\t\t\tisa = XCBuildConfiguration;[\s\S]*?\n\t\t\};/g)]
    .map(m => (m[0].match(new RegExp(`${settingRef} = "?([^";]+)"?;`)) || [])[1])
    .filter(Boolean);
  displayName = [...new Set(selorgBlocks)].join(', ') || null;
}
check('ios CFBundleDisplayName', displayName, expected.displayName);

const gsi = read('ios/Selorg/GoogleService-Info.plist');
if (gsi) {
  const val = key => (gsi.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`)) || [])[1];
  check('ios GoogleService-Info BUNDLE_ID', val('BUNDLE_ID'), expected.iosBundleId);
  check('ios GoogleService-Info PROJECT_ID', val('PROJECT_ID'), expected.firebaseProjectId);
} else {
  check('ios GoogleService-Info.plist', null, 'present');
}

const iconDir = path.join(ROOT, 'ios/Selorg/Images.xcassets/AppIcon.appiconset');
const icons = fs.existsSync(iconDir) ? fs.readdirSync(iconDir).filter(f => /\.(png|jpe?g)$/i.test(f)) : [];
if (icons.length === 0) note('ios AppIcon.appiconset', 'no image files (pre-existing gap, not an identity mismatch)');

report();

function report() {
  let failed = 0;
  for (const r of results) {
    if (r.note) {
      console.log(`  WARN  ${r.label}: ${r.note}`);
    } else if (r.ok) {
      console.log(`  OK    ${r.label} = ${r.want}`);
    } else {
      failed += 1;
      console.log(`  FAIL  ${r.label}: expected ${r.want}, found ${r.actual}`);
    }
  }
  console.log(failed ? `[native] ${failed} mismatch(es) for brand "${brand}"` : `[native] brand "${brand}" matches`);
  process.exit(failed ? 1 : 0);
}
