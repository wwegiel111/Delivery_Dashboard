import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_TIME_ZONE, LOCALE_COOKIE, resolveLocale } from "./config";
import { MESSAGES } from "./messages";

/** Język z cookie (domyślnie polski) — ten sam przy SSR i na kliencie, więc bez migania i błędów hydratacji. */
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  return { locale, messages: MESSAGES[locale], timeZone: DEFAULT_TIME_ZONE };
});
