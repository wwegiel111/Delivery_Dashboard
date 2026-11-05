import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __etpromoPrisma?: PrismaClient };

/** Jeden klient na proces (Next.js dev przeładowuje moduły — nie mnożymy połączeń). */
export const prisma: PrismaClient =
  globalForPrisma.__etpromoPrisma ?? new PrismaClient({ log: process.env.PRISMA_LOG === "1" ? ["query"] : ["warn", "error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.__etpromoPrisma = prisma;
