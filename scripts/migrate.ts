import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { closePool, query } from "../src/lib/db";

async function main() {
  const sql = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  await query(sql);
  console.log("✔ schema applied");
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
