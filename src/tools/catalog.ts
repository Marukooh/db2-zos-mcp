import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db2Client, TableInfo } from "../db2.js";
import { formatQueryResult, text } from "../format.js";
import { reg } from "../register.js";
import type { ColumnsArgs, TablesArgs } from "../types.js";

const TABLE_TYPES: Record<string, string> = {
  T: "TABLE", V: "VIEW", A: "ALIAS", G: "TEMP", M: "MQT", X: "AUX", C: "CLONE", P: "IMPLICIT",
};

const tablesSchema = {
  schema: z.string().optional().describe("Schema (creator) to filter; defaults to DB2_SCHEMA if set"),
};
const columnsSchema = {
  table: z.string().min(1).describe('Table name, optionally schema-qualified (e.g. "MYSCHEMA.MYTABLE")'),
  schema: z.string().optional().describe("Schema name if not included in the table name; defaults to DB2_SCHEMA"),
};

function describeTable(t: TableInfo): string {
  const type = String(t.type).trim();
  const remark = t.remarks?.trim() ? ` — ${t.remarks.trim()}` : "";
  return `${String(t.schema).trim()}.${String(t.name).trim()} [${TABLE_TYPES[type] ?? type}]${remark}`;
}

export function registerCatalogTools(server: McpServer, client: Db2Client): void {
  reg(
    server,
    "db2_get_tables",
    {
      description: "List tables, views and aliases from the DB2 z/OS catalog (SYSIBM.SYSTABLES), optionally filtered by schema.",
      inputSchema: tablesSchema,
      annotations: { readOnlyHint: true },
    },
    async (rawArgs) => {
      const { schema } = rawArgs as TablesArgs;
      const { tables, limited } = await client.getTables(schema);
      if (tables.length === 0) return text("No tables found.");
      const note = limited ? "\n\n⚠️  Showing the first 500 objects; filter by schema to see more." : "";
      return text(`Found ${tables.length} objects:\n\n${tables.map(describeTable).join("\n")}${note}`);
    },
  );

  reg(
    server,
    "db2_get_columns",
    {
      description: "Get column definitions for a DB2 z/OS table (type, length, scale, nullability, remarks).",
      inputSchema: columnsSchema,
      annotations: { readOnlyHint: true },
    },
    async (rawArgs) => {
      const { table, schema } = rawArgs as ColumnsArgs;
      const result = await client.getColumns(table, schema);
      if (result.rowCount === 0) return text(`Table ${table} not found (or no access to it).`);
      return text(formatQueryResult(result));
    },
  );

  reg(
    server,
    "db2_get_schemas",
    {
      description: "List all non-system schemas (table creators) in the DB2 z/OS subsystem.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const schemas = await client.getSchemas();
      if (schemas.length === 0) return text("No schemas found.");
      return text(`Found ${schemas.length} schemas:\n\n${schemas.join("\n")}`);
    },
  );
}
