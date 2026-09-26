export function statusMeta(status: string) {
  const map: Record<string, { label: string; c: string; bg: string }> = {
    pending: { label: 'Order placed', c: '#B5741A', bg: '#FAF1DF' },
    confirmed: { label: 'Confirmed', c: '#2B6C8C', bg: '#E4F0F6' },
    'getting-packed': { label: 'Getting packed', c: '#8A5CC0', bg: '#EFE7F8' },
    'on-the-way': { label: 'On the way', c: '#034703', bg: '#E4F2E8' },
    arrived: { label: 'Arrived', c: '#034703', bg: '#E4F2E8' },
    delivered: { label: 'Delivered', c: '#2F7D32', bg: '#EAF1E1' },
    cancelled: { label: 'Cancelled', c: '#D32F2F', bg: '#FDECEC' },
  };
  return map[status] || { label: status, c: '#4C4C4C', bg: '#FFFFFF' };
}

export function formatCurrency(n: number): string {
  return '₹' + Number(n).toLocaleString('en-IN');
}
