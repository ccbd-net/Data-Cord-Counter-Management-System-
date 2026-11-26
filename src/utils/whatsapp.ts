export interface OwnerReportSummaryItem {
  ownerName: string;
  ownerPhone?: string;
  vehicles: string[];
  tripCount: number;
  bookedSeats?: number;
  seatFare?: number;
  cargoFare?: number;
  totalFare: number;
  fuelExpectedCost?: number;
  fuelActualCost?: number;
  fuelCostDiff?: number | null;
  customLines?: string[];
}

/**
 * Normalizes Bangladesh and international mobile numbers to WhatsApp wa.me format (no leading +).
 * Examples:
 * - "01711-223344" -> "8801711223344"
 * - "+880 1711 223344" -> "8801711223344"
 * - "8801711223344" -> "8801711223344"
 */
export function normalizeWhatsAppPhone(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^\d]/g, '');
  if (!digits || digits.length < 10) return '';
  if (digits.startsWith('880') && digits.length >= 13) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `88${digits}`;
  if (digits.startsWith('1') && digits.length === 10) return `880${digits}`;
  return digits;
}

export function buildWhatsAppUrl(phone?: string, message: string = ''): string {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return '';
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${normalized}${encoded ? `?text=${encoded}` : ''}`;
}

export function normalizeRegNo(regNo?: string): string {
  if (!regNo) return '';
  return regNo.replace(/ঢাকা\s*মেট্রো-ব\s*/g, '').replace(/\s+/g, '').trim().toLowerCase();
}

const toBn = (n: number | string) => {
  const bn = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(n).replace(/\d/g, (d) => bn[parseInt(d, 10)]);
};

const fmtTk = (amount: number) => {
  const abs = Math.round(Math.abs(amount));
  const formatted = toBn(abs.toLocaleString('en-IN'));
  return amount < 0 ? `-৳${formatted}` : `৳${formatted}`;
};

export function formatSignedFuelCostDiff(diff?: number | null): string {
  if (diff === null || diff === undefined || Number.isNaN(diff)) return '-';
  const rounded = Math.round(diff);
  if (rounded > 0) return `+৳${toBn(rounded.toLocaleString('en-IN'))}`;
  if (rounded < 0) return `-৳${toBn(Math.abs(rounded).toLocaleString('en-IN'))}`;
  return `৳০`;
}

export function buildOwnerWhatsAppMessage(
  companyName: string,
  title: string,
  dateLabel: string,
  item: OwnerReportSummaryItem
): string {
  const lines: string[] = [
    `*${companyName || 'পরিবহন সার্ভিস'}*`,
    `${title}`,
    `তারিখ: ${dateLabel}`,
    `মালিক: ${item.ownerName}`,
    `গাড়ি: ${item.vehicles.join(', ')}`,
    `-------------------------`,
    `মোট ট্রিপ: ${toBn(item.tripCount)} টি`,
  ];

  if (item.bookedSeats !== undefined) {
    lines.push(`মোট সিট: ${toBn(item.bookedSeats)} টি`);
  }
  if (item.seatFare !== undefined) {
    lines.push(`সিট ভাড়া: ${fmtTk(item.seatFare)}`);
  }
  if (item.cargoFare !== undefined) {
    lines.push(`মালের ভাড়া: ${fmtTk(item.cargoFare)}`);
  }
  lines.push(`সর্বমোট আদায়: ${fmtTk(item.totalFare)}`);

  if (item.fuelActualCost !== undefined && item.fuelActualCost > 0) {
    lines.push(`-------------------------`);
    if (item.fuelExpectedCost !== undefined) {
      lines.push(`তেলের নির্ধারিত মূল্য: ${fmtTk(item.fuelExpectedCost)}`);
    }
    lines.push(`প্রদানকৃত তেলের মূল্য: ${fmtTk(item.fuelActualCost)}`);
    if (item.fuelCostDiff !== undefined && item.fuelCostDiff !== null) {
      lines.push(`তেল +/- মূল্য: ${formatSignedFuelCostDiff(item.fuelCostDiff)}`);
    }
  }

  if (item.customLines && item.customLines.length > 0) {
    lines.push(`-------------------------`);
    lines.push(...item.customLines);
  }

  return lines.join('\n');
}
