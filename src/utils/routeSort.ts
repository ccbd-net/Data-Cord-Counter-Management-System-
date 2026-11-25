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
 * Resolves explicit numeric route number (if provided & positive) or extracts from routeName.
 */
export function resolveRouteNumber(routeNumber?: number, routeName?: string): number {
  if (typeof routeNumber === 'number' && !isNaN(routeNumber) && routeNumber > 0) {
    return routeNumber;
  }
  return extractRouteNumber(routeName);
}

/**
 * Safely splits a booking's fare into seatFare, cargoFare, and totalFare (backward compatible).
 */
export function getBookingFareParts(b: {
  seatFare?: number;
  cargoFare?: number;
  totalFare?: number;
}): { seatFare: number; cargoFare: number; totalFare: number } {
  const cargoFare = Math.max(0, Number(b.cargoFare) || 0);
  const totalFare = Math.max(0, Number(b.totalFare) || 0);
  const seatFare =
    b.seatFare !== undefined && b.seatFare !== null && !isNaN(Number(b.seatFare))
      ? Math.max(0, Number(b.seatFare))
      : Math.max(0, totalFare - cargoFare);
  return {
    seatFare,
    cargoFare,
    totalFare: seatFare + cargoFare,
  };
}

/**
 * Sorts Route items numerically by explicit routeNumber or extracted route number (1, 2, 3...), then alphabetically.
 */
export function sortRoutesByNumber<T extends { name: string; routeNumber?: number }>(routes: T[]): T[] {
  return [...routes].sort((a, b) => {
    const numA = resolveRouteNumber(a.routeNumber, a.name);
    const numB = resolveRouteNumber(b.routeNumber, b.name);
    if (numA !== numB) return numA - numB;
    return a.name.localeCompare(b.name, 'bn');
  });
}

export interface RouteScheduleGroup {
  routeNumber: number; // Explicit or extracted numeric route number or sequential fallback
  displayOrder: number; // 1, 2, 3...
  routeName: string;
  trips: (Schedule & { serialInRoute: number })[];
}

/**
 * Groups schedules by routeName, sorts route groups strictly by Route Number (1, 2, 3...),
 * and sorts trips inside each route group chronologically by departureTime (and date).
 */
export function groupSchedulesByRouteNumber(tripList: Schedule[]): RouteScheduleGroup[] {
  const routeMap = new Map<string, { routeNumber: number; trips: Schedule[] }>();
  for (const t of tripList) {
    const rName = (t.routeName || 'অনির্ধারিত রুট').trim();
    const rNum = resolveRouteNumber(t.routeNumber, rName);
    if (!routeMap.has(rName)) {
      routeMap.set(rName, { routeNumber: rNum, trips: [] });
    } else {
      const entry = routeMap.get(rName)!;
      if (rNum < entry.routeNumber) entry.routeNumber = rNum;
    }
    routeMap.get(rName)!.trips.push(t);
  }

  const entries = Array.from(routeMap.entries()).sort(([nameA, valA], [nameB, valB]) => {
    if (valA.routeNumber !== valB.routeNumber) return valA.routeNumber - valB.routeNumber;
    return nameA.localeCompare(nameB, 'bn');
  });

  return entries.map(([routeName, val], idx) => {
    const sortedTrips = [...val.trips].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (
        parseDepartureTimeToMinutes(a.departureTime) -
        parseDepartureTimeToMinutes(b.departureTime)
      );
    });

    return {
      routeNumber: val.routeNumber !== Number.MAX_SAFE_INTEGER ? val.routeNumber : idx + 1,
      displayOrder: idx + 1,
      routeName,
      trips: sortedTrips.map((t, tIdx) => ({
        ...t,
        serialInRoute: tIdx + 1,
      })),
    };
  });
}
