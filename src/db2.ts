// ibm_db ships CommonJS without usable TypeScript declarations, so require() is used.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const ibmdb: any = require("ibm_db");
import { buildConnectionString, type Db2Config } from "./config.js";
import { assertReadOnly, assertWrite, normalizeSql } from "./sql.js";

export { classifySQL } from "./sql.js";

export interface ColumnInfo {
  name: string;
  dataType: string;
}

export interface QueryResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  executionTimeMs: number;
}

export interface WriteResult {
  affectedRows: number;
  executionTimeMs: number;
}

export interface TableInfo {
  schema: string;
  name: string;
  type: string;
  remarks: string | null;
}

export const MAX_ROWS_LIMIT = 10_000;
const CATALOG_LIMIT = 500;

function errMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

// ibm_db close() may return a promise, undefined, or throw; cleanup must never mask the real result.
async function safely(fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch {
    // ignore
  }
}

export class Db2Client {
  private readonly connStr: string;
  // Reusing connections avoids a full TCP + TLS + DRDA handshake on every tool call.
  private readonly pool = new ibmdb.Pool({ autoCleanIdle: true, idleTimeout: 5 * 60_000, maxPoolSize: 4 });

  constructor(private readonly config: Db2Config) {
    this.connStr = buildConnectionString(config);
  }

  private async withConnection<T>(fn: (conn: any) => Promise<T>): Promise<T> {
    let conn: any;
    try {
      conn = await this.pool.open(this.connStr);
    } catch (err) {
      throw new Error(`DB2 connection failed: ${errMessage(err)}`);
    }
    try {
      return await fn(conn);
    } finally {
      await safely(() => conn.close());
    }
  }

  /** Runs a read-only query, fetching at most maxRows rows (the rest stays on the server). */
  async read(sql: string, params: unknown[] = [], maxRows = MAX_ROWS_LIMIT): Promise<QueryResult> {
    assertReadOnly(sql);
    const start = Date.now();
    return this.withConnection(async (conn) => {
      let result: any;
      try {
        [result] = await conn.queryResult(normalizeSql(sql), params);
      } catch (err) {
        throw new Error(`Query error: ${errMessage(err)}`);
      }
      try {
        const rows: Record<string, unknown>[] = [];
        let truncated = false;
        for (;;) {
          const row = await result.fetch();
          if (!row) break;
          if (rows.length >= maxRows) {
            truncated = true;
            break;
          }
          rows.push(row);
        }
        return { columns: columnsOf(result, rows), rows, rowCount: rows.length, truncated, executionTimeMs: Date.now() - start };
      } finally {
        await safely(() => result.close());
      }
    });
  }

  async write(sql: string, params: unknown[] = []): Promise<WriteResult> {
    assertWrite(sql);
    const start = Date.now();
    return this.withConnection(async (conn) => {
      let stmt: any;
      try {
        stmt = await conn.prepare(normalizeSql(sql));
        const affected = await stmt.executeNonQuery(params);
        return { affectedRows: typeof affected === "number" ? affected : -1, executionTimeMs: Date.now() - start };
      } catch (err) {
        throw new Error(`Statement error: ${errMessage(err)}`);
      } finally {
        if (stmt) await safely(() => stmt.close());
      }
    });
  }

  async getTables(schema?: string): Promise<{ tables: TableInfo[]; limited: boolean }> {
    const effective = (schema ?? this.config.schema)?.toUpperCase();
    const sql = `
      SELECT CREATOR AS "schema", NAME AS "name", TYPE AS "type", REMARKS AS "remarks"
      FROM SYSIBM.SYSTABLES
      WHERE ${effective ? "CREATOR = ?" : "CREATOR NOT LIKE 'SYS%'"}
      ORDER BY CREATOR, NAME
      FETCH FIRST ${CATALOG_LIMIT + 1} ROWS ONLY`;
    const { rows } = await this.read(sql, effective ? [effective] : []);
    return { tables: rows.slice(0, CATALOG_LIMIT) as unknown as TableInfo[], limited: rows.length > CATALOG_LIMIT };
  }

  async getColumns(tableName: string, schema?: string): Promise<QueryResult> {
    const dot = tableName.indexOf(".");
    const table = (dot >= 0 ? tableName.slice(dot + 1) : tableName).toUpperCase();
    const owner = (dot >= 0 ? tableName.slice(0, dot) : (schema ?? this.config.schema))?.toUpperCase();
    const sql = `
      SELECT TBCREATOR AS "schema", TBNAME AS "table", NAME AS "column", COLTYPE AS "dataType",
             LENGTH AS "length", SCALE AS "scale", NULLS AS "nullable", "DEFAULT" AS "default",
             REMARKS AS "remarks"
      FROM SYSIBM.SYSCOLUMNS
      WHERE TBNAME = ?${owner ? " AND TBCREATOR = ?" : ""}
      ORDER BY TBCREATOR, COLNO`;
    return this.read(sql, owner ? [table, owner] : [table]);
  }

  async getSchemas(): Promise<string[]> {
    const { rows } = await this.read(`
      SELECT DISTINCT CREATOR AS "name"
      FROM SYSIBM.SYSTABLES
      WHERE CREATOR NOT LIKE 'SYS%'
      ORDER BY 1`);
    return rows.map((r) => String(r["name"]).trim());
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const { rows } = await this.read(
        `SELECT CURRENT SERVER AS "server", CURRENT SQLID AS "sqlid", CURRENT SCHEMA AS "schema" FROM SYSIBM.SYSDUMMY1`,
      );
      const r = rows[0] ?? {};
      return {
        success: true,
        message: `Connection OK — location ${String(r["server"]).trim()}, SQLID ${String(r["sqlid"]).trim()}, schema ${String(r["schema"]).trim()}`,
      };
    } catch (err) {
      return { success: false, message: errMessage(err) };
    }
  }

  async close(): Promise<void> {
    await safely(() => this.pool.close());
  }
}

function columnsOf(result: any, rows: Record<string, unknown>[]): ColumnInfo[] {
  try {
    const meta: Array<Record<string, unknown>> = result.getColumnMetadataSync();
    if (Array.isArray(meta) && meta.length > 0) {
      return meta.map((m) => ({ name: String(m["SQL_DESC_NAME"]), dataType: String(m["SQL_DESC_TYPE_NAME"] ?? "unknown") }));
    }
  } catch {
    // Metadata is optional; fall back to row keys.
  }
  return rows.length > 0 ? Object.keys(rows[0]).map((name) => ({ name, dataType: "unknown" })) : [];
}
