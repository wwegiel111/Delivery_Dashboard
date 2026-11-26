import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl bez prefiksów w URL: język z cookie, konfiguracja w src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  transpilePackages: ["@etpromo/contracts", "@etpromo/db"],
  // pdfkit wczytuje swoje pliki danych z dysku — nie bundlujemy go.
  serverExternalPackages: ["pdfkit"],
};

export default withNextIntl(config);
