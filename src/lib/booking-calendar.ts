// Calendar dates are plain dates in the shop's timezone, not browser-local
// instants. UTC arithmetic keeps them stable across browser timezones and DST.
export function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function startOfCalendarMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export function shiftCalendarMonth(date: string, months: number) {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
}

export function calendarMonthDates(month: string) {
  const first = startOfCalendarMonth(month);
  const last = addCalendarDays(shiftCalendarMonth(first, 1), -1);
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const leading = (weekday + 6) % 7; // Monday first.
  const count = Number(last.slice(-2));
  const cells: (string | null)[] = Array(leading).fill(null);
  for (let day = 0; day < count; day++) cells.push(addCalendarDays(first, day));
  while (cells.length % 7) cells.push(null);
  return { first, last, cells };
}

export function calendarMonthLabel(month: string) {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${startOfCalendarMonth(month)}T00:00:00Z`));
}

export function calendarDateLabel(date: string) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}
