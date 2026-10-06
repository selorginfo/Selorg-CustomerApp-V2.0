import { Platform, Share } from 'react-native';
import { generatePDF } from 'react-native-html-to-pdf';
import ReactNativeBlobUtil from 'react-native-blob-util';

export interface InvoicePdfRow {
  name: string;
  quantity: number;
  price: number;
}

export interface InvoicePdfInput {
  invoiceNumber: string;
  orderNumber: string;
  placedDate: string;
  billedToLabel?: string;
  billedToAddress?: string;
  paymentLabel: string;
  rows: InvoicePdfRow[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tip: number;
  total: number;
  gstNote?: string;
}

const money = (n: number) => `Rs. ${Number(n || 0).toFixed(2)}`;

/** Escape values before they reach the PDF template. */
function esc(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(data: InvoicePdfInput): string {
  const rows = data.rows
    .map(
      r => `<tr>
        <td class="name">${esc(r.name)}</td>
        <td class="num">${r.quantity}</td>
        <td class="num">${money(r.price)}</td>
        <td class="num">${money(r.price * r.quantity)}</td>
      </tr>`,
    )
    .join('');

  const line = (label: string, value: string, strong = false) =>
    `<div class="row${strong ? ' strong' : ''}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;

  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; padding: 28px; }
  .top { display: flex; justify-content: space-between; border-bottom: 2px solid #14532d; padding-bottom: 12px; }
  .brand { font-size: 22px; font-weight: 700; color: #14532d; }
  .sub { font-size: 11px; color: #666; margin-top: 2px; }
  .right { text-align: right; font-size: 12px; }
  .sec { margin-top: 18px; }
  .eyebrow { font-size: 10px; letter-spacing: .08em; color: #666; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
  th { text-align: left; font-size: 10px; letter-spacing: .06em; color: #666; border-bottom: 1px solid #ddd; padding: 6px 4px; }
  td { padding: 7px 4px; border-bottom: 1px solid #f0f0f0; }
  td.num, th.num { text-align: right; }
  td.name { width: 52%; }
  .totals { margin-top: 14px; margin-left: auto; width: 62%; font-size: 12px; }
  .row { display: flex; justify-content: space-between; padding: 4px 0; }
  .row.strong { font-weight: 700; font-size: 14px; border-top: 1px dashed #bbb; margin-top: 6px; padding-top: 8px; }
  .foot { margin-top: 26px; font-size: 10px; color: #777; border-top: 1px solid #eee; padding-top: 10px; }
</style></head><body>
  <div class="top">
    <div><div class="brand">Selorg</div><div class="sub">Tax Invoice</div></div>
    <div class="right"><div><strong>#${esc(data.invoiceNumber)}</strong></div><div class="sub">${esc(data.placedDate)}</div></div>
  </div>

  ${
    data.billedToAddress
      ? `<div class="sec"><div class="eyebrow">BILLED TO</div>
         <div style="margin-top:4px;font-weight:600;">${esc(data.billedToLabel || '')}</div>
         <div class="sub">${esc(data.billedToAddress)}</div></div>`
      : ''
  }

  <div class="sec">
    <table>
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div class="totals">
    ${line('Item total', money(data.subtotal))}
    ${data.discount > 0 ? line('Discount', `- ${money(data.discount)}`) : ''}
    ${line('Delivery', data.deliveryFee === 0 ? 'FREE' : money(data.deliveryFee))}
    ${data.tip > 0 ? line('Tip', money(data.tip)) : ''}
    ${line('Total paid', money(data.total), true)}
  </div>

  <div class="foot">
    <div>Order #${esc(data.orderNumber)} &middot; Payment: ${esc(data.paymentLabel)}</div>
    ${data.gstNote ? `<div>${esc(data.gstNote)}</div>` : ''}
  </div>
</body></html>`;
}

export type InvoiceExportResult =
  /** Android: the PDF now exists in the public Downloads collection. */
  | { kind: 'saved'; fileName: string }
  /** iOS: handed to the share sheet. */
  | { kind: 'shared'; fileName: string };

/**
 * Render the invoice to a PDF and deliver it to the user.
 *
 * React Native's Share only honours `url` on iOS, so sharing the generated file
 * that way silently drops the attachment on Android. Android instead copies the
 * PDF into the public Downloads collection via MediaStore, which is a real
 * download the user can find in their files app.
 */
export async function shareInvoicePdf(data: InvoicePdfInput): Promise<InvoiceExportResult> {
  const safeName = `Selorg-${data.invoiceNumber}`.replace(/[^\w-]/g, '-');
  const fileName = `${safeName}.pdf`;

  const { filePath } = await generatePDF({
    html: buildHtml(data),
    fileName: safeName,
    // Android writes to the app's Documents dir; iOS resolves it internally.
    directory: Platform.OS === 'android' ? 'Documents' : undefined,
    shouldPrintBackgrounds: true,
  });

  if (!filePath) throw new Error('PDF generation returned no file path');

  const bare = filePath.replace(/^file:\/\//, '');

  if (Platform.OS === 'android') {
    await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
      { name: fileName, parentFolder: '', mimeType: 'application/pdf' },
      'Download',
      bare,
    );
    return { kind: 'saved', fileName };
  }

  await Share.share({ url: `file://${bare}`, title: 'Selorg invoice' });
  return { kind: 'shared', fileName };
}
