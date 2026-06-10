import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

async function fileHash(filePath: string) {
  const bytes = await fs.readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

const schemaPath = path.join(process.cwd(), "docs", "schema.sql");
const migrationPath = path.join(process.cwd(), "migrations", "0001_initial.sql");

async function main() {
  const [schemaHash, migrationHash] = await Promise.all([
    fileHash(schemaPath),
    fileHash(migrationPath)
  ]);

  if (schemaHash !== migrationHash) {
    console.error("schema.sql and migrations/0001_initial.sql differ.");
    console.error(`docs/schema.sql:              ${schemaHash}`);
    console.error(`migrations/0001_initial.sql: ${migrationHash}`);
    process.exit(1);
  }

  console.log("schema.sql and 0001 migration hashes match.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
