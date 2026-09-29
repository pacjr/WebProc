import { addDays, format, parseISO } from "date-fns";

const BUSINESS_TIMEZONE = "America/Sao_Paulo";

/** Calendar date (YYYY-MM-DD) for “today” in Connect Pulse business timezone. */
export function todayBusinessDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: BUSINESS_TIMEZONE });
}

export function firstDayOfCurrentMonthBusinessDate(): string {
  const today = todayBusinessDate();
  const [year, month] = today.split("-");
  return `${year}-${month}-01`;
}

export function businessDateDaysAgo(daysBack: number): string {
  const today = parseISO(todayBusinessDate());
  return format(addDays(today, -daysBack), "yyyy-MM-dd");
}

/** Parse YYYY-MM-DD as local calendar date (avoids UTC day shift). */
export function parseBusinessDateOnly(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatBusinessDateLabel(isoDate: string): string {
  return format(parseBusinessDateOnly(isoDate), "dd/MM/yyyy");
}

export function formatBusinessDateShort(isoDate: string): string {
  return format(parseBusinessDateOnly(isoDate), "dd/MM");
}

export function formatPeriodRangeLabel(start: string, end: string): string {
  return `${formatBusinessDateLabel(start)} – ${formatBusinessDateLabel(end)}`;
}

export const PULSE_BUSINESS_TIMEZONE_LABEL = "America/Sao_Paulo";

/** UI copy: tight parentheses, e.g. (America/Sao_Paulo) */
export function pulseTimezoneParenthetical(): string {
  return `(${PULSE_BUSINESS_TIMEZONE_LABEL})`;
}

/** Registration/event instant shown in Connect business timezone (timestamptz from Pulse RPC). */
export function formatPulseRegistrationTimestamp(isoTimestamptz: string): string {
  const parsed = new Date(isoTimestamptz);
  if (Number.isNaN(parsed.getTime())) {
    return isoTimestamptz;
  }
  return parsed.toLocaleString("pt-BR", {
    timeZone: BUSINESS_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
