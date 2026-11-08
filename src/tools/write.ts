import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db2Client } from "../db2.js";
import { assertWrite } from "../sql.js";
import { formatDryRun, text } from "../format.js";
import { reg } from "../register.js";
import type { WriteArgs } from "../types.js";

const DESCRIPTION =
  "Execute a write or DDL statement (INSERT, UPDATE, DELETE, MERGE, CREATE, DROP, ALTER, " +
  "TRUNCATE, RENAME, GRANT, REVOKE, CALL, COMMENT, LABEL) against DB2 z/OS. Autocommit is on.\n\n" +
  "⚠️  MANDATORY TWO-STEP PROTOCOL:\n" +
  "1. FIRST call with dry_run=true → show the formatted SQL to the user and ask for confirmation.\n" +
  "2. ONLY after the user confirms, call again with dry_run=false to execute.\n" +
  "Never skip the dry_run=true step.";

const schema = {
  sql: z.string().min(1).describe("INSERT / UPDATE / DELETE / MERGE / DDL / CALL statement"),
  params: z.array(z.any()).optional().describe("Positional parameters for ? placeholders"),
  dry_run: z
    .boolean()
    .describe(
      "true = validate and preview only (no DB contact). ALWAYS call with dry_run=true first, show the SQL " +
        "to the user and ask for confirmation, then call again with dry_run=false only after explicit confirmation.",
    ),
};

export function registerWriteTool(server: McpServer, client: Db2Client): void {
  reg(
    server,
    "db2_write",
    {
      description: DESCRIPTION,
      inputSchema: schema,
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (rawArgs) => {
      const { sql, params, dry_run } = rawArgs as WriteArgs;
      if (dry_run) {
        assertWrite(sql);
        return text(formatDryRun(sql, params ?? []));
      }
      const { affectedRows, executionTimeMs } = await client.write(sql, params ?? []);
      return text(
        [
          "✅ Statement executed successfully.",
          `Affected rows: ${affectedRows < 0 ? "N/A" : affectedRows}`,
          `Execution time: ${executionTimeMs}ms`,
        ].join("\n"),
      );
    },
  );
}
