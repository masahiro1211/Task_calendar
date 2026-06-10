import { loadEnvConfig } from "@next/env";
import { runMigrations } from "../src/db/migrations";

loadEnvConfig(process.cwd());

async function main() {
  const directDatabaseUrl = process.env.DIRECT_DATABASE_URL;

  if (!directDatabaseUrl) {
    throw new Error("DIRECT_DATABASE_URL is required for db:migrate.");
  }

  await runMigrations(directDatabaseUrl);

  console.log("Migrations applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
