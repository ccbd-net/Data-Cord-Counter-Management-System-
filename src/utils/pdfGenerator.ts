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
 * Downloads a DOM element as a crisp PDF using html2canvas
 * 100% supports Bengali Unicode script, barcodes, logos and styling!
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

  // Generate high-resolution canvas
  const canvas = await html2canvas(element, {
    scale: 2.5,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth,
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: paperFormat,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const imgWidth = pageWidth - 10;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (imgHeight > pageHeight - 10) {
    // If it exceeds one page, fit proportionally or scale
    const scaledWidth = ((pageHeight - 10) * canvas.width) / canvas.height;
    const xOffset = (pageWidth - scaledWidth) / 2;
    doc.addImage(imgData, 'JPEG', xOffset, 5, scaledWidth, pageHeight - 10);
  } else {
    const xOffset = (pageWidth - imgWidth) / 2;
    doc.addImage(imgData, 'JPEG', xOffset, 5, imgWidth, imgHeight);
  }

  doc.save(fileName);
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
      console.warn('Canvas PDF failed, falling back to print window:', err);
    }
  }

  // Fallback: Trigger print dialog which allows "Save as PDF" with 100% vector Bangla text
  window.print();
}

/**
 * Printable Popup Window Helper
 * Opens dedicated isolated window with Hind Siliguri font and triggers window.print()
 * Fully optimized for POS Thermal Printers (58mm, 80mm) and A4 / Letter PDF export.
 */
export function openPrintWindow(
  htmlContent: string,
  title: string = 'প্রিন্ট ডকুমেন্ট',
  paperSize: '58mm' | '80mm' | 'A4' | 'A4-landscape' = '58mm'
) {
  // Remove any existing print iframe
  const existing = document.getElementById('zb-print-iframe');
  if (existing) {
    existing.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'zb-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  let pageCss = '';
  let containerWidth = '54mm';

  if (paperSize === '58mm') {
    pageCss = '@page { size: 58mm auto; margin: 0.5mm; }';
    containerWidth = '54mm';
  } else if (paperSize === '80mm') {
    pageCss = '@page { size: 80mm auto; margin: 1mm; }';
    containerWidth = '74mm';
  } else if (paperSize === 'A4-landscape') {
    pageCss = '@page { size: A4 landscape; margin: 8mm; }';
    containerWidth = '100%';
  } else {
    pageCss = '@page { size: A4 portrait; margin: 8mm; }';
    containerWidth = '100%';
  }

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
        <title>${title}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700;800&display=swap');
          ${pageCss}
          
          * { 
            box-sizing: border-box; 
            margin: 0; 
            padding: 0; 
          }
          
          body {
            font-family: 'Hind Siliguri', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #000000;
            background: #ffffff;
            font-size: 11px;
            line-height: 1.35;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .print-wrapper {
            width: ${containerWidth};
            max-width: 100%;
            margin: 0 auto;
            padding: 4px;
            background: #ffffff;
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
            line-height: 1.3 !important;
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

          /* General Report Table Rules */
          table.report-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
            margin-bottom: 8px;
          }

          table.report-table th, 
          table.report-table td {
            border: 1px solid #000000 !important;
            padding: 5px 6px;
            font-size: 10.5px;
            text-align: left;
          }

          table.report-table th {
            background-color: #f1f5f9 !important;
            font-weight: bold;
            color: #0f172a;
          }

          /* Helpers */
          .text-center { text-align: center !important; }
          .text-left { text-align: left !important; }
          .text-right { text-align: right !important; }
          .font-bold { font-weight: 700 !important; }
          .font-black { font-weight: 800 !important; }
          .uppercase { text-transform: uppercase; }
          
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
            .no-print {
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
        </style>
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
      console.warn('Canvas PDF export failed, falling back to window.print():', err);
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
      console.warn('Canvas PDF export failed, falling back to window.print():', err);
    }
  }
  window.print();
}

