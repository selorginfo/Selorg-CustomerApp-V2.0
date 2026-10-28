export function expectedOtpLength(otpLength?: number): number {
  const length = Number(otpLength);
  return Number.isInteger(length) && length >= 4 && length <= 8 ? length : 4;
}

export function otpLengthMessage(code: string, otpLength?: number): string | null {
  const length = expectedOtpLength(otpLength);
  if (code.length === length) return null;
  return `Enter the ${length}-digit code`;
}
