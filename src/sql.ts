// Pure SQL classification helpers (no driver dependency, so they are unit-testable).

const READ_KEYWORDS = /^(SELECT|WITH|VALUES)\b/i;
const WRITE_KEYWORDS =
  /^(INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|ALTER|TRUNCATE|RENAME|GRANT|REVOKE|CALL|COMMENT|LABEL)\b/i;
// SELECT ... FROM FINAL TABLE (INSERT ...) modifies data in DB2.
const DATA_CHANGE_TABLE = /\b(FINAL|NEW|OLD)\s+TABLE\s*\(/i;

/** Removes comments and replaces string/quoted-identifier contents so keywords inside them are ignored. */
export function stripLiteralsAndComments(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\//g, (m) =>
    m.startsWith("'") ? "''" : m.startsWith('"') ? '""' : " ",
  );
}

/** Drops a single trailing semicolon; DB2 CLI rejects it in dynamic SQL. */
export function normalizeSql(sql: string): string {
  return sql.trim().replace(/;\s*$/, "").trimEnd();
}

export type SqlKind = "read" | "write" | "unknown";

export function classifySQL(sql: string): SqlKind {
  const code = stripLiteralsAndComments(sql).trim();
  if (READ_KEYWORDS.test(code)) return DATA_CHANGE_TABLE.test(code) ? "write" : "read";
  if (WRITE_KEYWORDS.test(code)) return "write";
  return "unknown";
}

function assertSingleStatement(sql: string): void {
  if (stripLiteralsAndComments(normalizeSql(sql)).includes(";")) {
    throw new Error("Multiple statements in a single call are not allowed.");
  }
}

export function assertReadOnly(sql: string): void {
  assertSingleStatement(sql);
  if (classifySQL(sql) !== "read") {
    throw new Error(
      "Only SELECT/WITH/VALUES queries without data-change table references are allowed in db2_read. " +
        "Use db2_write for INSERT, UPDATE, DELETE, DDL, etc.",
    );
  }
}

export function assertWrite(sql: string): void {
  assertSingleStatement(sql);
  const kind = classifySQL(sql);
  if (kind === "read") throw new Error("Read-only queries are not allowed in db2_write. Use db2_read instead.");
  if (kind === "unknown") {
    throw new Error(
      "Unrecognised SQL statement type. Allowed write statements: INSERT, UPDATE, DELETE, MERGE, CREATE, " +
        "DROP, ALTER, TRUNCATE, RENAME, GRANT, REVOKE, CALL, COMMENT, LABEL.",
    );
  }
}
