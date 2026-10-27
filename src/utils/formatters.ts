// Bengali numeral mapping
const BENGALI_DIGITS: { [key: string]: string } = {
  '0': '০',
  '1': '১',
  '2': '২',
  '3': '৩',
  '4': '৪',
  '5': '৫',
  '6': '৬',
  '7': '৭',
  '8': '৮',
  '9': '৯',
};

export function toBengaliDigits(val: number | string | undefined | null): string {
  if (val === undefined || val === null) return '';
  return val.toString().replace(/[0-9]/g, (match) => BENGALI_DIGITS[match] || match);
}

export function formatTaka(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null) return '৳০';
  const num = typeof amount === 'string' ? parseFloat(amount) || 0 : amount;
  return `৳${toBengaliDigits(num.toLocaleString('en-US'))}`;
}

export function getTodayDhakaDate(): string {
  const now = new Date();
  // Dhaka is UTC+6
  const dhakaTime = new Date(now.getTime() + 6 * 3600 * 1000);
  return dhakaTime.toISOString().split('T')[0];
}

const BENGALI_MONTHS = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
];

export function formatBengaliDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parts[2];
      return `${toBengaliDigits(day)} ${BENGALI_MONTHS[monthIdx] || ''} ${toBengaliDigits(year)}`;
    }
    const d = new Date(dateStr);
    return `${toBengaliDigits(d.getDate())} ${BENGALI_MONTHS[d.getMonth()]} ${toBengaliDigits(d.getFullYear())}`;
  } catch {
    return dateStr;
  }
}

export function formatBengaliDateTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const dateFormatted = formatBengaliDate(isoString.split('T')[0]);
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'পিএম' : 'এএম';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minStr = minutes < 10 ? '0' + minutes : minutes;
    return `${dateFormatted}, ${toBengaliDigits(hours)}:${toBengaliDigits(minStr)} ${ampm}`;
  } catch {
    return isoString;
  }
}
