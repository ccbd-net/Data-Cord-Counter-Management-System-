import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { Booking, Schedule, SystemSettings } from '../types/index.ts';

/**
 * Cleanly combines UP and DOWN route names into a single sequential result route
 * Example: "মাদারীপুর - ঢাকা" + "ঢাকা - মাদারীপুর" => "মাদারীপুর - ঢাকা - মাদারীপুর"
 * Example: "কালকিনি - গুলিস্তান" + "কদমতলী - মাদারীপুর" => "কালকিনি - গুলিস্তান - কদমতলী - মাদারীপুর"
 */
export function combineRouteNames(upRouteName?: string, downRouteName?: string): string {
  if (!upRouteName && !downRouteName) return '-';
  if (!upRouteName) return downRouteName || '-';
  if (!downRouteName) return upRouteName || '-';

  const parseStops = (r: string) =>
    r
      .split(/[-–—⇌→+]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const upStops = parseStops(upRouteName);
  const downStops = parseStops(downRouteName);

  if (upStops.length === 0) return downRouteName;
  if (downStops.length === 0) return upRouteName;

  const combined: string[] = [...upStops];
  for (let i = 0; i < downStops.length; i++) {
    const stop = downStops[i];
    // Skip duplicate connecting pivot station
    if (i === 0 && combined[combined.length - 1].toLowerCase() === stop.toLowerCase()) {
      continue;
    }
    combined.push(stop);
  }

  return combined.join(' - ');
}

/**
 * Calculates time difference between Up and Down departure times
 * Example: Up "07:30 PM", Down "08:30 AM" (Next day) => "১৩ ঘণ্টা ০০ মি."
 */
export function calculateTimeDifference(
  timeUp?: string,
  timeDown?: string,
  isNightHold?: boolean
): string {
  if (!timeUp || !timeDown) return '-';

  const parseToMinutes = (timeStr: string): number | null => {
    try {
      const cleaned = timeStr.trim().toUpperCase();
      const match12 = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
      if (match12) {
        let hours = parseInt(match12[1], 10);
        const mins = parseInt(match12[2], 10);
        const ampm = match12[3];
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        return hours * 60 + mins;
      }
      return null;
    } catch {
      return null;
    }
  };

  const mUp = parseToMinutes(timeUp);
  const mDown = parseToMinutes(timeDown);

  if (mUp === null || mDown === null) return '-';

  let diff = mDown - mUp;
  if (isNightHold || diff < 0) {
    // Crosses over midnight / next day
    diff += 24 * 60;
  }

  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;

  const toBn = (n: number) => {
    const bn = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(n).replace(/\d/g, (d) => bn[parseInt(d, 10)]);
  };

  if (hours === 0 && minutes === 0) return '০ মিনিট';
  if (hours === 0) return `${toBn(minutes)} মিনিট`;
  if (minutes === 0) return `${toBn(hours)} ঘণ্টা`;
  return `${toBn(hours)} ঘণ্টা ${toBn(minutes)} মি.`;
}

/**
 * Converts a Bengali number
 */
export function toBnDigits(num: number | string): string {
  const bn = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(num).replace(/\d/g, (d) => bn[parseInt(d, 10)]);
}

/**
 * Shared standalone pure-HEX print/PDF stylesheet (zero Tailwind oklch/oklab rules so html2canvas never crashes)
 */
function getIsolatedDocumentStyles(
  paperSize: '58mm' | '80mm' | 'A4' | 'A4-landscape' = 'A4-landscape'
): { pageCss: string; containerWidth: string; cssText: string } {
  let pageCss = '';
  let containerWidth = '100%';

  if (paperSize === '58mm') {
    pageCss = '@page { size: 58mm auto; margin: 0.5mm; }';
    containerWidth = '54mm';
  } else if (paperSize === '80mm') {
    pageCss = '@page { size: 80mm auto; margin: 1mm; }';
    containerWidth = '74mm';
  } else if (paperSize === 'A4-landscape') {
    pageCss = '@page { size: A4 landscape; margin: 5mm; }';
    containerWidth = '100%';
  } else {
    pageCss = '@page { size: A4 portrait; margin: 8mm; }';
    containerWidth = '100%';
  }

  const cssText = `
    ${pageCss}

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      font-family: 'Hind Siliguri', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      font-size: 11px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .print-wrapper {
      width: ${containerWidth};
      max-width: 100%;
      margin: 0 auto;
      padding: 10px 12px;
      background: #ffffff;
      color: #0f172a;
    }

    /* Force any hidden print-only blocks visible inside isolated export document */
    .hidden, .print\\:block {
      display: block !important;
    }
    .print\\:hidden, .no-print {
      display: none !important;
    }
    .overflow-x-auto, .overflow-y-auto {
      overflow: visible !important;
      max-height: none !important;
    }

    /* Thermal Receipt Structured Table Rules */
    table.receipt-table {
      width: 100% !important;
      border-collapse: collapse !important;
      margin: 0 !important;
      table-layout: fixed !important;
    }
    table.receipt-table td {
      padding: 3px 0 !important;
      vertical-align: middle !important;
      border: none !important;
      font-size: 11px !important;
      line-height: 1.35 !important;
    }
    table.receipt-table td.lbl {
      width: 42% !important;
      text-align: left !important;
      color: #1e293b !important;
      font-weight: 600 !important;
      white-space: nowrap !important;
    }
    table.receipt-table td.val {
      width: 58% !important;
      text-align: right !important;
      color: #000000 !important;
      font-weight: 800 !important;
      word-break: break-word !important;
    }

    /* General Report Tables - border-collapse: separate prevents html2canvas border/glyph overlap */
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
    }
    table.report-table {
      width: 100% !important;
      border-collapse: separate !important;
      border-spacing: 0 !important;
      border-top: 1px solid #475569 !important;
      border-left: 1px solid #475569 !important;
      margin-top: 8px;
      margin-bottom: 10px;
      font-size: 10.5px !important;
      line-height: 1.55 !important;
    }
    table.report-table th,
    table.report-table td {
      border: none !important;
      border-right: 1px solid #475569 !important;
      border-bottom: 1px solid #475569 !important;
      padding: 7px 6px !important;
      font-size: 10.5px !important;
      line-height: 1.55 !important;
      vertical-align: middle !important;
      word-break: normal !important;
      overflow-wrap: break-word !important;
      color: #0f172a;
    }
    table.report-table th {
      background-color: #e2e8f0 !important;
      font-weight: 700 !important;
      color: #0f172a !important;
      padding: 8px 6px !important;
      line-height: 1.45 !important;
      text-align: center;
    }
    table.report-table tfoot td {
      background-color: #e2e8f0 !important;
      color: #0f172a !important;
      font-weight: 800 !important;
      padding: 8px 6px !important;
      line-height: 1.55 !important;
    }

    /* Compact A4-Landscape Data Table (zero glyph/border overlap) */
    .recon-print-header {
      text-align: center !important;
      border-bottom: 1.5px solid #0f172a !important;
      padding-bottom: 8px !important;
      margin-bottom: 10px !important;
    }
    .recon-company-name {
      font-size: 19px !important;
      font-weight: 800 !important;
      color: #0f172a !important;
      letter-spacing: 0.2px !important;
      line-height: 1.35 !important;
    }
    .recon-subtitle {
      font-size: 11px !important;
      font-weight: 600 !important;
      color: #334155 !important;
      margin-top: 3px !important;
      line-height: 1.4 !important;
    }
    table.recon-compact-table {
      width: 100% !important;
      table-layout: fixed !important;
      border-collapse: separate !important;
      border-spacing: 0 !important;
      border-top: 1px solid #475569 !important;
      border-left: 1px solid #475569 !important;
      margin: 0 0 10px 0 !important;
      font-size: 10px !important;
      line-height: 1.6 !important;
    }
    table.recon-compact-table th,
    table.recon-compact-table td {
      border: none !important;
      border-right: 1px solid #475569 !important;
      border-bottom: 1px solid #475569 !important;
      padding: 7px 5px !important;
      font-size: 10px !important;
      line-height: 1.6 !important;
      word-break: normal !important;
      overflow-wrap: break-word !important;
      vertical-align: middle !important;
    }
    table.recon-compact-table th {
      background-color: #e2e8f0 !important;
      color: #0f172a !important;
      font-weight: 700 !important;
      text-align: center !important;
      padding: 8px 5px !important;
      line-height: 1.5 !important;
    }
    table.recon-compact-table tfoot td {
      background-color: #e2e8f0 !important;
      color: #0f172a !important;
      font-weight: 800 !important;
      padding: 8px 5px !important;
      line-height: 1.6 !important;
    }

    /* Safe Pure-HEX Fallbacks for Common Utility Classes */
    .bg-white { background-color: #ffffff !important; }
    .bg-slate-50 { background-color: #f8fafc !important; }
    .bg-slate-100 { background-color: #f1f5f9 !important; }
    .bg-slate-200 { background-color: #e2e8f0 !important; }
    .text-slate-900, .text-slate-950 { color: #0f172a !important; }
    .text-slate-800, .text-slate-700 { color: #334155 !important; }
    .text-slate-600, .text-slate-500 { color: #475569 !important; }
    .text-blue-800, .text-blue-700 { color: #1e40af !important; }
    .text-emerald-800, .text-emerald-700 { color: #065f46 !important; }
    .text-rose-700, .text-red-700 { color: #b91c1c !important; }
    .text-purple-800 { color: #6b21a8 !important; }
    .border { border: 1px solid #cbd5e1 !important; }
    .border-b { border-bottom: 1px solid #cbd5e1 !important; }
    .border-b-2 { border-bottom: 2px solid #1e293b !important; }
    .border-t { border-top: 1px solid #cbd5e1 !important; }
    .border-t-2 { border-top: 2px solid #475569 !important; }
    .border-slate-300 { border-color: #cbd5e1 !important; }
    .border-slate-400 { border-color: #94a3b8 !important; }
    .border-slate-600 { border-color: #475569 !important; }
    .border-slate-800 { border-color: #1e293b !important; }
    .p-1 { padding: 4px !important; }
    .p-1\\.5 { padding: 5px !important; }
    .p-2 { padding: 6px !important; }
    .p-3 { padding: 8px !important; }
    .p-4 { padding: 10px !important; }
    .p-6 { padding: 12px !important; }
    .pb-4 { padding-bottom: 10px !important; }
    .pt-2 { padding-top: 6px !important; }
    .pt-12 { padding-top: 24px !important; }
    .mb-2 { margin-bottom: 6px !important; }
    .mb-3 { margin-bottom: 10px !important; }
    .mt-2 { margin-top: 6px !important; }
    .space-y-4 > * + * { margin-top: 10px !important; }
    .space-y-5 > * + * { margin-top: 12px !important; }
    .grid { display: grid !important; }
    .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
    .grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
    .gap-3 { gap: 8px !important; }
    .gap-8 { gap: 20px !important; }
    .flex { display: flex !important; }
    .justify-between { justify-content: space-between !important; }
    .items-center { align-items: center !important; }
    .rounded-xl, .rounded-2xl, .rounded-full { border-radius: 6px !important; }
    .text-xs { font-size: 10.5px !important; }
    .text-sm { font-size: 11.5px !important; }
    .text-2xl { font-size: 18px !important; }
    .text-center { text-align: center !important; }
    .text-left { text-align: left !important; }
    .text-right { text-align: right !important; }
    .font-bold { font-weight: 700 !important; }
    .font-black { font-weight: 800 !important; }
    .font-semibold { font-weight: 600 !important; }
    .uppercase { text-transform: uppercase; }
    .whitespace-nowrap { white-space: nowrap !important; }
    .tabular-nums { font-variant-numeric: tabular-nums; }

    .border-box {
      border: 1.5px solid #000000 !important;
      border-radius: 5px !important;
      padding: 6px 8px !important;
      margin-bottom: 6px !important;
      background: #ffffff !important;
    }
    .dashed-box {
      border: 1.5px dashed #000000 !important;
      border-radius: 5px !important;
      padding: 6px 8px !important;
      margin-bottom: 6px !important;
      background: #ffffff !important;
    }
    .tear-divider {
      text-align: center !important;
      border-top: 2px dashed #000000 !important;
      margin: 14px 0 12px 0 !important;
      padding-top: 6px !important;
      font-size: 10px !important;
      font-weight: 800 !important;
      letter-spacing: 1px !important;
    }

    @media print {
      body {
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
      .no-print, .print\\:hidden {
        display: none !important;
      }
      .print-wrapper {
        width: ${containerWidth} !important;
        max-width: ${containerWidth} !important;
        margin: 0 auto !important;
        padding: 0 !important;
      }
      .receipt-content {
        border: 1.5px solid #000000 !important;
        box-shadow: none !important;
      }
    }
  `;

  return { pageCss, containerWidth, cssText };
}

/**
 * Downloads ONLY a specific DOM element as a crisp PDF inside a clean isolated iframe
 * (100% immune to Tailwind v4 oklch crashes & never falls back to full-page screen capture!)
 */
export async function downloadElementAsPDF(
  elementId: string,
  fileName: string,
  orientation: 'portrait' | 'landscape' = 'portrait',
  paperFormat: 'a4' | [number, number] = 'a4'
) {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element #${elementId} not found for PDF export.`);
  }

  const paperSize: '58mm' | '80mm' | 'A4' | 'A4-landscape' = Array.isArray(paperFormat)
    ? '80mm'
    : orientation === 'landscape'
    ? 'A4-landscape'
    : 'A4';

  const targetWidth = Array.isArray(paperFormat)
    ? 320
    : orientation === 'landscape'
    ? 1440
    : 820;

  const { cssText } = getIsolatedDocumentStyles(paperSize);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = `${targetWidth}px`;
  iframe.style.height = '2600px';
  iframe.style.border = 'none';
  iframe.style.background = '#ffffff';
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error('Could not initialize PDF rendering frame.');
    }

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html lang="bn">
        <head>
          <meta charset="utf-8" />
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" />
          <style>${cssText}</style>
        </head>
        <body style="margin:0;padding:0;background:#ffffff;width:${targetWidth}px;">
          <div id="isolated-pdf-root" class="print-wrapper" style="width:${targetWidth}px;max-width:${targetWidth}px;padding:12px 16px;background:#ffffff;">
            ${element.innerHTML}
          </div>
        </body>
      </html>
    `);
    iframeDoc.close();

    // Allow fonts & layout inside isolated iframe to settle cleanly
    try {
      await (iframeDoc as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 350));

    const rootEl = iframeDoc.getElementById('isolated-pdf-root') || iframeDoc.body;
    const captureWidth = Math.max(targetWidth, rootEl.scrollWidth || targetWidth);
    const captureHeight = Math.max(100, rootEl.scrollHeight || rootEl.offsetHeight);

    const canvas = await html2canvas(rootEl, {
      scale: 2.2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.96);

    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: paperFormat,
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = Array.isArray(paperFormat) ? 2 : 4;
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;

    const imgWidth = printableWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight <= printableHeight) {
      doc.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
    } else {
      let heightLeft = imgHeight;
      let position = margin;
      doc.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
      heightLeft -= printableHeight;

      while (heightLeft > 1) {
        position -= printableHeight;
        doc.addPage();
        doc.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
        heightLeft -= printableHeight;
      }
    }

    doc.save(fileName);
  } finally {
    iframe.remove();
  }
}

/**
 * Downloads high quality Bus Ticket PDF with company logo & pure Bengali
 */
export async function downloadTicketPDF(booking: Booking, companyName?: string) {
  const element = document.getElementById('printable-thermal-ticket');
  if (element) {
    try {
      await downloadElementAsPDF(
        'printable-thermal-ticket',
        `Ticket-${booking.ticketNo}.pdf`,
        'portrait',
        [80, 200]
      );
      return;
    } catch (err) {
      console.warn('Canvas PDF failed, falling back to isolated print:', err);
      openPrintWindow(element.innerHTML, `Ticket-${booking.ticketNo}`, '80mm');
      return;
    }
  }

  window.print();
}

/**
 * Printable Popup Window Helper
 * Opens dedicated isolated iframe with Hind Siliguri font and triggers print() ONLY for that content.
 */
export function openPrintWindow(
  htmlContent: string,
  title: string = 'প্রিন্ট ডকুমেন্ট',
  paperSize: '58mm' | '80mm' | 'A4' | 'A4-landscape' = '58mm'
) {
  const existing = document.getElementById('zb-print-iframe');
  if (existing) {
    existing.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'zb-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = paperSize === 'A4-landscape' ? '1440px' : '820px';
  iframe.style.height = '900px';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const { cssText } = getIsolatedDocumentStyles(paperSize);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="bn">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" />
        <title>${title}</title>
        <style>${cssText}</style>
      </head>
      <body>
        <div class="print-wrapper">
          ${htmlContent}
        </div>
      </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    }
  }, 450);
}

/**
 * Print ONLY a specific DOM element by ID inside the isolated print iframe
 */
export function printElementById(
  elementId: string,
  title: string = 'প্রিন্ট ডকুমেন্ট',
  paperSize: '58mm' | '80mm' | 'A4' | 'A4-landscape' = 'A4-landscape'
) {
  const el = document.getElementById(elementId);
  if (el) {
    openPrintWindow(el.innerHTML, title, paperSize);
  } else {
    window.print();
  }
}

/**
 * Downloads Daily Trip Schedule Summary PDF with Bengali support
 */
export async function downloadDailyTripsPDF(
  schedules: Schedule[],
  date: string,
  settings?: SystemSettings
) {
  const el = document.getElementById('printable-trip-report');
  if (el) {
    try {
      await downloadElementAsPDF('printable-trip-report', `DailyTrips-${date}.pdf`, 'landscape', 'a4');
      return;
    } catch (err) {
      console.warn('Canvas PDF export failed, falling back to isolated print:', err);
      openPrintWindow(el.innerHTML, `DailyTrips-${date}`, 'A4-landscape');
      return;
    }
  }
  window.print();
}

/**
 * Downloads Waybill PDF with Bengali support
 */
export async function downloadWaybillPDF(
  schedule: Schedule,
  bookings: Booking[],
  settings?: SystemSettings
) {
  const el = document.getElementById('printable-supervisor-waybill');
  if (el) {
    try {
      await downloadElementAsPDF(
        'printable-supervisor-waybill',
        `Waybill-${schedule.tripNo}-${schedule.date}.pdf`,
        'portrait',
        'a4'
      );
      return;
    } catch (err) {
      console.warn('Canvas PDF export failed, falling back to isolated print:', err);
      openPrintWindow(el.innerHTML, `Waybill-${schedule.tripNo}-${schedule.date}`, 'A4');
      return;
    }
  }
  window.print();
}

