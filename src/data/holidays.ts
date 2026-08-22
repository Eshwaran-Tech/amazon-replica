/**
 * Indian public holidays, for the travel calendars.
 *
 * The reference's date picker marks holidays and counts them per month --
 * "August 2026, 3 Holidays" -- because a holiday is when buses fill up and
 * fares climb, so it is genuinely useful to see one before picking a date.
 *
 * These are the real gazetted and widely observed holidays. The fixed-date ones
 * (Republic Day, Independence Day, Gandhi Jayanti, Christmas) are exact. The
 * lunar ones (Holi, Diwali, Eid, Janmashtami and the rest) move each year and
 * are listed per year rather than computed -- an approximation would be worse
 * than useless on a calendar, and the arithmetic for four different lunar
 * calendars does not belong in a storefront.
 *
 * Years beyond the table simply show no holidays, which is honest. Adding a
 * year is a handful of lines.
 */

export interface Holiday {
  /** `YYYY-MM-DD`. */
  date: string;
  name: string;
  /** Gazetted holidays close banks and offices; the rest are widely observed. */
  gazetted: boolean;
}

const HOLIDAYS: Holiday[] = [
  // ------------------------------------------------------------------ 2026
  { date: '2026-01-01', name: "New Year's Day", gazetted: false },
  { date: '2026-01-14', name: 'Makar Sankranti / Pongal', gazetted: false },
  { date: '2026-01-26', name: 'Republic Day', gazetted: true },
  { date: '2026-03-03', name: 'Holi', gazetted: true },
  { date: '2026-03-21', name: 'Id-ul-Fitr', gazetted: true },
  { date: '2026-03-26', name: 'Ram Navami', gazetted: true },
  { date: '2026-03-31', name: 'Mahavir Jayanti', gazetted: true },
  { date: '2026-04-03', name: 'Good Friday', gazetted: true },
  { date: '2026-04-14', name: 'Ambedkar Jayanti', gazetted: true },
  { date: '2026-05-01', name: 'Buddha Purnima', gazetted: true },
  { date: '2026-05-27', name: 'Id-ul-Zuha (Bakrid)', gazetted: true },
  { date: '2026-06-26', name: 'Muharram', gazetted: true },
  { date: '2026-08-15', name: 'Independence Day', gazetted: true },
  { date: '2026-08-26', name: 'Milad un-Nabi', gazetted: true },
  { date: '2026-08-28', name: 'Raksha Bandhan', gazetted: false },
  { date: '2026-09-04', name: 'Janmashtami', gazetted: true },
  { date: '2026-09-14', name: 'Ganesh Chaturthi', gazetted: false },
  { date: '2026-10-02', name: 'Gandhi Jayanti', gazetted: true },
  { date: '2026-10-20', name: 'Dussehra', gazetted: true },
  { date: '2026-11-08', name: 'Diwali', gazetted: true },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti', gazetted: true },
  { date: '2026-12-25', name: 'Christmas Day', gazetted: true },

  // ------------------------------------------------------------------ 2027
  { date: '2027-01-01', name: "New Year's Day", gazetted: false },
  { date: '2027-01-14', name: 'Makar Sankranti / Pongal', gazetted: false },
  { date: '2027-01-26', name: 'Republic Day', gazetted: true },
  { date: '2027-02-20', name: 'Holi', gazetted: true },
  { date: '2027-03-11', name: 'Id-ul-Fitr', gazetted: true },
  { date: '2027-03-26', name: 'Good Friday', gazetted: true },
  { date: '2027-04-14', name: 'Ambedkar Jayanti', gazetted: true },
  { date: '2027-04-15', name: 'Ram Navami', gazetted: true },
  { date: '2027-05-17', name: 'Id-ul-Zuha (Bakrid)', gazetted: true },
  { date: '2027-08-15', name: 'Independence Day', gazetted: true },
  { date: '2027-08-25', name: 'Janmashtami', gazetted: true },
  { date: '2027-10-02', name: 'Gandhi Jayanti', gazetted: true },
  { date: '2027-10-09', name: 'Dussehra', gazetted: true },
  { date: '2027-10-28', name: 'Diwali', gazetted: true },
  { date: '2027-12-25', name: 'Christmas Day', gazetted: true },
];

const BY_DATE = new Map(HOLIDAYS.map((holiday) => [holiday.date, holiday]));

export function holidayOn(dateKey: string): Holiday | undefined {
  return BY_DATE.get(dateKey);
}

/** Every holiday in a given month, for the calendar's per-month count. */
export function holidaysInMonth(year: number, month: number): Holiday[] {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  return HOLIDAYS.filter((holiday) => holiday.date.startsWith(prefix));
}

/** True when the date is a Saturday, Sunday or a holiday -- a busy travel day. */
export function isBusyDay(dateKey: string): boolean {
  if (holidayOn(dateKey)) return true;
  const parts = dateKey.split('-').map(Number);
  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) return false;
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 0 || weekday === 6;
}
