import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@etpromo/contracts", "@etpromo/db"],
  // pdfkit wczytuje swoje pliki danych z dysku — nie bundlujemy go.
  serverExternalPackages: ["pdfkit"],
};

export default config;
