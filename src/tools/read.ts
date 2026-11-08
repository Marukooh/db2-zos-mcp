import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MAX_ROWS_LIMIT, type Db2Client } from "../db2.js";
import { formatQueryResult, text } from "../format.js";
import { reg } from "../register.js";
import type { ReadArgs } from "../types.js";

const schema = {
  sql: z.string().min(1).describe("SELECT, WITH or VALUES query to execute"),
  params: z.array(z.any()).optional().describe("Positional parameters for ? placeholders"),
  maxRows: z
    .number()
    .int()
    .min(1)
    .max(MAX_ROWS_LIMIT)
    .optional()
    .describe(`Max rows to return (default 100, max ${MAX_ROWS_LIMIT})`),
};

export function registerReadTool(server: McpServer, client: Db2Client): void {
  reg(
    server,
    "db2_read",
    {
      description:
        "Execute a read-only query against DB2 z/OS and return results as a text table. " +
        "Only SELECT, WITH (CTE) and VALUES are accepted; data-change table references " +
        "(FINAL/NEW/OLD TABLE) and multiple statements are rejected. Use ? placeholders with params for values.",
      inputSchema: schema,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (rawArgs) => {
      const { sql, params, maxRows } = rawArgs as ReadArgs;
      const limit = maxRows ?? 100;
      const result = await client.read(sql, params ?? [], limit);
      const note = result.truncated ? `\n\n⚠️  Truncated to ${limit} rows (more rows available; raise maxRows or refine the query)` : "";
      return text(formatQueryResult(result) + note);
    },
  );
}
