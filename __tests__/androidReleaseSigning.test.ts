const fs = require('fs');
const path = require('path');

const gradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
const gradle = fs.readFileSync(gradlePath, 'utf8');

describe('Customer Android release signing guard', () => {
  it('fails release when SELORG_UPLOAD_* signing is missing', () => {
    expect(gradle).toContain('SELORG_UPLOAD_STORE_FILE');
    expect(gradle).toContain('!signingConfigs.release.storeFile');
    expect(gradle).toMatch(/Release build needs SELORG_UPLOAD_/);
  });

  it('allows an explicit unsigned smoke opt-out only', () => {
    expect(gradle).toContain('allowUnsignedRelease');
  });

  it('keeps debug signing on the debug keystore', () => {
    expect(gradle).toMatch(/debug\s*\{[\s\S]*signingConfig signingConfigs\.debug/);
  });

  it('names unsigned release APKs distinctly', () => {
    expect(gradle).toContain('selorg-customer-app-${version}-unsigned.apk');
  });

  it('names unsigned release AABs distinctly when signing is bypassed', () => {
    expect(gradle).toContain('selorg-customer-app-${version}-unsigned.aab');
    expect(gradle).toMatch(/unsigned[\s\S]*selorg-customer-app-\$\{version\}-unsigned\.aab/);
  });

  it('does not embed store passwords in the tracked gradle file', () => {
    expect(gradle).not.toMatch(/SELORG_UPLOAD_STORE_PASSWORD\s*=\s*['"][^'"]+['"]/);
    expect(gradle).not.toMatch(/storePassword\s+['"](?!android)[^'"]+['"]/);
  });
});
