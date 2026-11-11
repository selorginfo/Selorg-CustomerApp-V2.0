const path = require('path');
const { KEY_RE, shouldScan } = require('../scripts/check-no-hardcoded-maps-key');

describe('no hardcoded Google Maps API keys', () => {
  it('keeps example env files on placeholders only', () => {
    const example = require('fs').readFileSync(
      path.join(__dirname, '..', '.env.example'),
      'utf8',
    );
    expect(example).toMatch(/GOOGLE_MAPS_API_KEY=your-google-maps-api-key/);
    expect(example).not.toMatch(KEY_RE);
  });

  it('treats .env.example as a scanned file', () => {
    expect(shouldScan(path.join('repo', '.env.example'))).toBe(true);
    expect(shouldScan(path.join('repo', 'android', 'app', 'google-services.json'))).toBe(false);
  });
});
