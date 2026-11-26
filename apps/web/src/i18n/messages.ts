import en from "../../messages/en.json";
import pl from "../../messages/pl.json";
import type { Locale } from "./config";

export type Messages = typeof pl;

/** Słowniki wczytywane statycznie — dostępne także poza kontekstem żądania (PDF, e-maile, testy). */
export const MESSAGES: Record<Locale, Messages> = { pl, en };
