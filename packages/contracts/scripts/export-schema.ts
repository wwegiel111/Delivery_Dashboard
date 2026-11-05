/** Eksport JSON Schema kontraktu dla serwisu Python (test zgodności Pydantic <-> zod). */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { SolveRequest, SolveResponse } from "../src/solve";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../../services/solver/app/contract.schema.json");

const schema = {
  SolveRequest: z.toJSONSchema(SolveRequest, { io: "input", reused: "inline" }),
  SolveResponse: z.toJSONSchema(SolveResponse, { io: "output", reused: "inline" }),
};
writeFileSync(out, JSON.stringify(schema, null, 2) + "\n");
console.log(`wrote ${out}`);
