import { promises as fs } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const migrationsDir = path.join(process.cwd(), "migrations");

export function assertNotPoolerUrl(connectionString: string) {
  const url = new URL(connectionString);

  if (url.hostname.includes("pooler") || url.port === "6543") {
    throw new Error(
      "Refusing to run migrations through a Supabase pooler URL. Use DIRECT_DATABASE_URL on port 5432."
    );
  }
}

export async function runMigrations(connectionString: string) {
  assertNotPoolerUrl(connectionString);

  const sql = postgres(connectionString, {
    max: 1,
    prepare: false
  });

  try {
    await sql`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `;

    const files = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const [{ exists }] = await sql<{ exists: boolean }[]>`
        select exists(
          select 1 from schema_migrations where name = ${file}
        ) as exists
      `;

      if (exists) {
        continue;
      }

      const migrationSql = await fs.readFile(path.join(migrationsDir, file), "utf8");

      await sql.begin(async (tx) => {
        await tx.unsafe(migrationSql);
        await tx`
          insert into schema_migrations (name)
          values (${file})
        `;
      });
    }
  } finally {
    await sql.end();
  }
}
