import type { Schedule } from '../types/index.ts';

const BN_TO_EN_DIGITS: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

export function toEnglishDigits(str: string): string {
  return str.replace(/[০-৯]/g, (d) => BN_TO_EN_DIGITS[d] ?? d);
}

/**
 * Extracts a numeric route number from route names such as:
 * "রুট নং -১ - মাদারীপুর - গুলিস্তান", "রুট নং-২", "1 নং রুট", "Route 3", "৩. ..."
 * Returns Infinity if no number is found so numbered routes sort first (1, 2, 3...).
 */
export function extractRouteNumber(routeName?: string): number {
  if (!routeName) return Number.MAX_SAFE_INTEGER;
  const normalized = toEnglishDigits(routeName.trim());

  // 1. Explicit patterns like "রুট নং -1", "রুট নং 2", "রুট-3", "route no 4", "route 5", "1 নং"
  const explicitPatterns = [
    /(?:রুট\s*(?:নং|নম্বর|no\.?)?\s*[-:.#]?\s*)(\d+)/i,
    /(\d+)\s*(?:নং|নম্বর)\s*রুট/i,
    /(?:route\s*(?:no\.?|#)?\s*[-:.]?\s*)(\d+)/i,
    /^(\d+)\s*[-.):]/,
  ];

  for (const pat of explicitPatterns) {
    const m = normalized.match(pat);
    if (m && m[1]) {
      const num = parseInt(m[1], 10);
      if (!isNaN(num)) return num;
    }
  }

  // 2. Fallback: first standalone number anywhere in the route name
  const anyNum = normalized.match(/\b(\d+)\b/);
  if (anyNum && anyNum[1]) {
    const num = parseInt(anyNum[1], 10);
    if (!isNaN(num)) return num;
  }

  return Number.MAX_SAFE_INTEGER;
}

/**
 * Converts 12-hour/24-hour time string (e.g. "04:30 AM", "08:00 PM") to minutes since midnight.
 */
export function parseDepartureTimeToMinutes(timeStr?: string): number {
  if (!timeStr) return 0;
  try {
    const normalized = toEnglishDigits(timeStr.trim());
    const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return 0;
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const ampm = (match[3] || '').toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  } catch {
    return 0;
  }
}

/**
 * Sorts Route items numerically by route number (1, 2, 3...), then alphabetically.
 */
export function sortRoutesByNumber<T extends { name: string }>(routes: T[]): T[] {
  return [...routes].sort((a, b) => {
    const numA = extractRouteNumber(a.name);
    const numB = extractRouteNumber(b.name);
    if (numA !== numB) return numA - numB;
    return a.name.localeCompare(b.name, 'bn');
  });
}

export interface RouteScheduleGroup {
  routeNumber: number; // Extracted numeric route number or sequential fallback
  displayOrder: number; // 1, 2, 3...
  routeName: string;
  trips: (Schedule & { serialInRoute: number })[];
}

/**
 * Groups schedules by routeName, sorts route groups strictly by Route Number (1, 2, 3...),
 * and sorts trips inside each route group chronologically by departureTime (and date).
 */
export function groupSchedulesByRouteNumber(tripList: Schedule[]): RouteScheduleGroup[] {
  const routeMap = new Map<string, Schedule[]>();
  for (const t of tripList) {
    const rName = (t.routeName || 'অনির্ধারিত রুট').trim();
    if (!routeMap.has(rName)) routeMap.set(rName, []);
    routeMap.get(rName)!.push(t);
  }

  const entries = Array.from(routeMap.entries()).sort(([nameA], [nameB]) => {
    const numA = extractRouteNumber(nameA);
    const numB = extractRouteNumber(nameB);
    if (numA !== numB) return numA - numB;
    return nameA.localeCompare(nameB, 'bn');
  });

  return entries.map(([routeName, trips], idx) => {
    const sortedTrips = [...trips].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (
        parseDepartureTimeToMinutes(a.departureTime) -
        parseDepartureTimeToMinutes(b.departureTime)
      );
    });

    const extracted = extractRouteNumber(routeName);
    return {
      routeNumber: extracted !== Number.MAX_SAFE_INTEGER ? extracted : idx + 1,
      displayOrder: idx + 1,
      routeName,
      trips: sortedTrips.map((t, tIdx) => ({
        ...t,
        serialInRoute: tIdx + 1,
      })),
    };
  });
}
