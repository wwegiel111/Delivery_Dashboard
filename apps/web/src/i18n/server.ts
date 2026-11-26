import { getLocale } from "next-intl/server";
import { resolveLocale, type Locale } from "./config";

/** Język bieżącego żądania (Server Components, Server Actions, Route Handlers). */
export async function currentLocale(): Promise<Locale> {
  return resolveLocale(await getLocale());
}
