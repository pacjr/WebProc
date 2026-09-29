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

export function formatBusinessDateLabel(isoDate: string): string {
  return format(parseISO(isoDate), "dd/MM/yyyy");
}

export function formatPeriodRangeLabel(start: string, end: string): string {
  return `${formatBusinessDateLabel(start)} – ${formatBusinessDateLabel(end)}`;
}

export const PULSE_BUSINESS_TIMEZONE_LABEL = "America/Sao_Paulo";

/** UI copy: tight parentheses, e.g. (America/Sao_Paulo) */
export function pulseTimezoneParenthetical(): string {
  return `(${PULSE_BUSINESS_TIMEZONE_LABEL})`;
}
