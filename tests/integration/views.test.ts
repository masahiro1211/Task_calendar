import type postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeIsolatedTestSql,
  createIsolatedTestSql,
  testDatabaseUrl
} from "./helpers/db";

type Sql = ReturnType<typeof postgres>;

const maybeDescribe = testDatabaseUrl ? describe : describe.skip;

maybeDescribe("derived views", () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await createIsolatedTestSql();
  });

  afterEach(async () => {
    await closeIsolatedTestSql(sql);
  });

  it("v_pool includes only open M/S leaves without future blocks", async () => {
    await sql`
      insert into tasks (id, parent_id, title, size, state, done_at)
      values
        ('00000000-0000-4000-8000-000000000001', null, 'included m leaf', 'M', 'open', null),
        ('00000000-0000-4000-8000-000000000002', null, 'included past-block s leaf', 'S', 'open', null),
        ('00000000-0000-4000-8000-000000000003', null, 'excluded l leaf', 'L', 'open', null),
        ('00000000-0000-4000-8000-000000000004', null, 'excluded non-leaf', 'M', 'open', null),
        ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000004', 'child keeps parent non-leaf', 'L', 'open', null),
        ('00000000-0000-4000-8000-000000000006', null, 'excluded done leaf', 'M', 'done', '2026-01-02T03:04:05Z'),
        ('00000000-0000-4000-8000-000000000007', null, 'excluded cancelled leaf', 'M', 'cancelled', null),
        ('00000000-0000-4000-8000-000000000008', null, 'excluded future block leaf', 'M', 'open', null)
    `;

    await sql`
      insert into blocks (task_id, start_at, end_at)
      values
        ('00000000-0000-4000-8000-000000000002', '2000-01-01T09:00:00Z', '2000-01-01T10:00:00Z'),
        ('00000000-0000-4000-8000-000000000008', '2099-01-01T09:00:00Z', '2099-01-01T10:00:00Z')
    `;

    const pool = await sql<{ title: string }[]>`
      select title from v_pool order by title
    `;

    expect(pool.map((row) => row.title)).toEqual([
      "included m leaf",
      "included past-block s leaf"
    ]);
  });

  it("v_tasks_resolved inherits ancestor deadlines until explicitly overridden", async () => {
    await sql`
      insert into tasks (id, parent_id, title, size, deadline)
      values
        ('00000000-0000-4000-8000-000000000101', null, 'root', 'L', '2026-07-01'),
        ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000101', 'child inherits', 'M', null),
        ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000102', 'child overrides', 'S', '2026-08-15'),
        ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000103', 'grandchild inherits override', 'S', null)
    `;

    const rows = await sql<{ title: string; effective_deadline: string }[]>`
      select title, effective_deadline::text
      from v_tasks_resolved
      order by depth
    `;

    expect(rows).toEqual([
      { title: "root", effective_deadline: "2026-07-01" },
      { title: "child inherits", effective_deadline: "2026-07-01" },
      { title: "child overrides", effective_deadline: "2026-08-15" },
      { title: "grandchild inherits override", effective_deadline: "2026-08-15" }
    ]);
  });

  it("v_needs_split includes only open L leaves", async () => {
    await sql`
      insert into tasks (id, parent_id, title, size, state, done_at)
      values
        ('00000000-0000-4000-8000-000000000201', null, 'included l leaf', 'L', 'open', null),
        ('00000000-0000-4000-8000-000000000202', null, 'excluded split l parent', 'L', 'open', null),
        ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000202', 'child of split parent', 'M', 'open', null),
        ('00000000-0000-4000-8000-000000000204', null, 'excluded m leaf', 'M', 'open', null),
        ('00000000-0000-4000-8000-000000000205', null, 'excluded done l leaf', 'L', 'done', '2026-01-02T03:04:05Z')
    `;

    const needsSplit = await sql<{ title: string }[]>`
      select title from v_needs_split order by title
    `;

    expect(needsSplit.map((row) => row.title)).toEqual(["included l leaf"]);
  });

  it("v_progress derives parent completion counts and latest child done_at", async () => {
    await sql`
      insert into tasks (id, parent_id, title, size, state, done_at)
      values
        ('00000000-0000-4000-8000-000000000301', null, 'parent', 'L', 'open', null),
        ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000301', 'first done child', 'S', 'done', '2026-02-01T09:00:00Z'),
        ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000301', 'latest done child', 'S', 'done', '2026-02-03T10:30:00Z')
    `;

    const [progress] = await sql<{
      done_children: string;
      total_children: string;
      derived_done_at: Date;
    }[]>`
      select done_children, total_children, derived_done_at
      from v_progress
      where id = '00000000-0000-4000-8000-000000000301'
    `;

    expect(progress.done_children).toBe("2");
    expect(progress.total_children).toBe("2");
    expect(progress.derived_done_at.toISOString()).toBe("2026-02-03T10:30:00.000Z");
  });

  it("v_progress excludes cancelled children from completion totals", async () => {
    await sql`
      insert into tasks (id, parent_id, title, size, state, done_at)
      values
        ('00000000-0000-4000-8000-000000000401', null, 'parent', 'L', 'open', null),
        ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000401', 'done child 1', 'S', 'done', '2026-02-01T09:00:00Z'),
        ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000401', 'done child 2', 'S', 'done', '2026-02-02T09:00:00Z'),
        ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000401', 'done child 3', 'S', 'done', '2026-02-03T09:00:00Z'),
        ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000401', 'done child 4', 'S', 'done', '2026-02-04T09:00:00Z'),
        ('00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-000000000401', 'cancelled child', 'S', 'cancelled', null)
    `;

    const [progress] = await sql<{
      done_children: string;
      total_children: string;
      derived_done_at: Date;
    }[]>`
      select done_children, total_children, derived_done_at
      from v_progress
      where id = '00000000-0000-4000-8000-000000000401'
    `;

    expect(progress.done_children).toBe("4");
    expect(progress.total_children).toBe("4");
    expect(progress.derived_done_at.toISOString()).toBe("2026-02-04T09:00:00.000Z");
  });
});
