import { expectedOtpLength, otpLengthMessage } from '../src/utils/otpLength';

describe('otpLength', () => {
  it('uses the length returned by send-otp', () => {
    expect(expectedOtpLength(6)).toBe(6);
    expect(otpLengthMessage('1234', 6)).toBe('Enter the 6-digit code');
    expect(otpLengthMessage('123456', 6)).toBeNull();
  });

  it('stays on 4 digits when the server does not say otherwise', () => {
    expect(expectedOtpLength(undefined)).toBe(4);
    expect(otpLengthMessage('1234')).toBeNull();
  });
});
