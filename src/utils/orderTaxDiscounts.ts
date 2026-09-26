/**
 * GST on final taxable value: product discount → (optional) coupon → then GST.
 * Matches exclusive / inclusive line pricing used with taxHelper semantics.
 */

export const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

export function lineTaxableAfterItemDiscount(
  lineGross: number,
  itemDiscount: number,
  ratePercent: number,
  taxIsInclusive: boolean,
): number {
  const after = round2(Math.max(0, lineGross - itemDiscount));
  if (after <= 0) return 0;
  const r = Math.max(0, Number(ratePercent)) || 0;
  if (r <= 0) return after;
  if (taxIsInclusive) {
    const taxAmount = round2((after * r) / (100 + r));
    return round2(after - taxAmount);
  }
  return after;
}

function proportionalAlloc(amount: number, weights: number[]): number[] {
  const n = weights.length;
  const totalW = round2(weights.reduce((a, b) => a + b, 0));
  if (n === 0 || amount <= 0 || totalW <= 0) return weights.map(() => 0);
  const out: number[] = [];
  let assigned = 0;
  for (let i = 0; i < n - 1; i++) {
    const w = round2((amount * weights[i]) / totalW);
    out.push(w);
    assigned = round2(assigned + w);
  }
  out.push(round2(amount - assigned));
  return out;
}

export type LineTaxSnapshot = {
  lineGross: number;
  itemDiscount: number;
  rate: number;
  isInclusive: boolean;
};

export type GstLineResult = { netTaxable: number; tax: number; lineTotal: number };

export function computeGstAfterOrderDiscounts(
  lines: LineTaxSnapshot[],
  orderLevelRupees: number,
): {
  orderTaxableAfterItems: number;
  orderFinalTaxable: number;
  orderTaxAmount: number;
  orderMerchandiseTotal: number;
  perLine: GstLineResult[];
} {
  const taxableAfterItems = lines.map(l =>
    lineTaxableAfterItemDiscount(
      l.lineGross,
      l.itemDiscount,
      l.rate,
      l.isInclusive,
    ),
  );
  const T = round2(taxableAfterItems.reduce((a, b) => a + b, 0));
  const D = round2(Math.max(0, orderLevelRupees));
  const Dapply = Math.min(D, T);
  const allocs =
    T > 0 && Dapply > 0
      ? proportionalAlloc(Dapply, taxableAfterItems)
      : lines.map(() => 0);
  const nets = taxableAfterItems.map((t, i) =>
    round2(Math.max(0, t - (allocs[i] || 0))),
  );

  const perLine: GstLineResult[] = lines.map((l, i) => {
    const net = nets[i];
    const r = Math.max(0, Number(l.rate)) || 0;
    const tax = r > 0 ? round2((net * r) / 100) : 0;
    const lineTotal = round2(net + tax);
    return { netTaxable: net, tax, lineTotal };
  });

  const orderFinalTaxable = round2(nets.reduce((a, b) => a + b, 0));
  const orderTaxAmount = round2(perLine.reduce((s, p) => s + p.tax, 0));
  const orderMerchandiseTotal = round2(orderFinalTaxable + orderTaxAmount);

  return {
    orderTaxableAfterItems: T,
    orderFinalTaxable,
    orderTaxAmount,
    orderMerchandiseTotal,
    perLine,
  };
}
