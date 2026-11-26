/** Identyfikatory treści pomocy (teksty w messages/*.json → `help.*`). Kompletność sprawdza help/content.test.ts. */
import type { Messages } from "@/i18n/messages";

export type FaqId = keyof Messages["help"]["faq"]["items"];
export type QuickStartId = keyof Messages["help"]["manual"]["quickStart"];

export const FAQ_IDS: FaqId[] = ["whyInfeasible", "optimalVsFeasible", "stale", "paramsChange", "editDelivery", "sendEmails"];
export const QUICK_START_IDS: QuickStartId[] = ["s1", "s2", "s3", "s4", "s5"];
