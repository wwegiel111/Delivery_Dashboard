/** CSV / XLSX -> wiersze { kolumna: tekst }. Nagłówki normalizowane do snake_case. */
import Papa from "papaparse";
import { LocalizedError } from "../errors";

export type RawRow = Record<string, string>;

export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Komórka Excela z datą to czas "ścienny" bez strefy (read-excel-file zwraca go jako UTC). */
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const date = `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
    return v.getUTCHours() || v.getUTCMinutes() ? `${date} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}` : date;
  }
  return String(v).trim();
}

export function rowsFromMatrix(matrix: unknown[][]): RawRow[] {
  const [header, ...body] = matrix;
  if (!header) return [];
  const keys = header.map((h) => normalizeHeader(cellToString(h)));
  return body
    .filter((r) => r.some((c) => cellToString(c) !== ""))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, cellToString(r[i])])));
}

export function parseCsv(text: string): RawRow[] {
  // Separator wykrywany automatycznie (polski Excel eksportuje CSV ze średnikiem).
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy", delimiter: "" });
  if (res.errors.length > 0 && res.data.length === 0) throw new LocalizedError("csv", { message: res.errors[0]!.message });
  return rowsFromMatrix(res.data);
}

export async function parseUpload(file: File): Promise<RawRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(await file.text());
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/node");
    const data = await readSheet(Buffer.from(await file.arrayBuffer()));
    return rowsFromMatrix(data as unknown[][]);
  }
  throw new LocalizedError("unsupportedFormat");
}
