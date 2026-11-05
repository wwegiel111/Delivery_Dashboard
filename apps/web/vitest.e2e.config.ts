import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** E2E: wymaga działającego Postgresa (DATABASE_URL) i solvera (SOLVER_URL) oraz `npm run db:seed`. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.e2e.test.ts"], testTimeout: 180_000, hookTimeout: 180_000 },
});
