const cache = new Map<string, Intl.DateTimeFormat>();

function f(tz: string, opts: Intl.DateTimeFormatOptions) {
  const key = tz + JSON.stringify(opts);
  let x = cache.get(key);
  if (!x) {
    x = new Intl.DateTimeFormat("pl-PL", { timeZone: tz, ...opts });
    cache.set(key, x);
  }
  return x;
}

export const fmtTime = (d: Date, tz: string) => f(tz, { hour: "2-digit", minute: "2-digit" }).format(d);
export const fmtDay = (d: Date, tz: string) => f(tz, { weekday: "short", day: "2-digit", month: "2-digit" }).format(d);
export const fmtDayTime = (d: Date, tz: string) =>
  f(tz, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
export const fmtDate = (d: Date, tz: string) => f(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** YYYY-MM-DD w strefie magazynu (parametr URL tygodnia). */
export function isoDay(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
