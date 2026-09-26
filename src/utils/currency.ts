/** Formats a number with Indian comma grouping (e.g. 148000 → "1,48,000.00"). */
export const formatINR = (value: number, decimals = 2): string => {
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const lastThree = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
    : lastThree;
  const formatted = decimals > 0 ? `${grouped}.${decPart}` : grouped;
  return value < 0 ? `-${formatted}` : formatted;
};
