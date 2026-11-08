import { classifySQL } from "./sql.js";
import type { QueryResult } from "./db2.js";
import type { ToolResult } from "./types.js";

const MAX_CELL = 200;

export function text(t: string): ToolResult {
  return { content: [{ type: "text", text: t }] };
}

export function cellValue(v: unknown): string {
  let s: string;
  if (v == null) s = "NULL";
  else if (typeof v === "string") s = v.replace(/\s+$/, ""); // DB2 CHAR columns are blank-padded
  else if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") s = String(v);
  else if (Buffer.isBuffer(v)) s = `0x${v.toString("hex").toUpperCase()}`;
  else if (v instanceof Date) s = v.toISOString();
  else {
    try {
      s = JSON.stringify(v) ?? "[object]";
    } catch {
      s = "[unserializable]";
    }
  }
  s = s.replace(/[\r\n\t]+/g, " ");
  return s.length > MAX_CELL ? `${s.slice(0, MAX_CELL - 1)}…` : s;
}

export function formatQueryResult(result: QueryResult): string {
  const { columns, rows, rowCount, executionTimeMs } = result;
  const header = `Rows returned: ${rowCount} (${executionTimeMs}ms)`;
  if (rowCount === 0) return header;

  const cols = columns.map((c) => c.name);
  const cells = rows.map((r) => cols.map((n) => cellValue(r[n])));
  const widths = cols.map((name, i) => Math.max(name.length, ...cells.map((row) => row[i].length)));
  const line = (vals: string[]) => vals.map((v, i) => v.padEnd(widths[i])).join(" | ");
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  return [header, line(cols), sep, ...cells.map(line)].join("\n");
}

export function formatDryRun(sql: string, params: unknown[]): string {
  const kind = classifySQL(sql).toUpperCase();
  const paramLines =
    params.length === 0 ? [] : ["", "Parameters:", ...params.map((p, i) => `  [${i + 1}] ${JSON.stringify(p)}`)];
  return [
    "DRY RUN — statement NOT executed.",
    `Type: ${kind}`,
    "",
    "```sql",
    sql.trim(),
    "```",
    ...paramLines,
    "",
    "Show this statement to the user and ask for explicit confirmation before calling db2_write with dry_run=false.",
  ].join("\n");
}
