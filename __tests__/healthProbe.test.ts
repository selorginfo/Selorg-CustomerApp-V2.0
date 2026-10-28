import { healthProbeUrl } from '../src/utils/healthProbe';

describe('healthProbeUrl', () => {
  it('probes /health on the API origin instead of the customer prefix', () => {
    expect(healthProbeUrl('https://api.selorg.com/api/v1/customer')).toBe('https://api.selorg.com/health');
    expect(healthProbeUrl('http://10.0.2.2:3333/api/v1/customer')).toBe('http://10.0.2.2:3333/health');
  });
});
