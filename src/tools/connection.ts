import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db2Client } from "../db2.js";
import { text } from "../format.js";
import { reg } from "../register.js";

export function registerConnectionTool(server: McpServer, client: Db2Client): void {
  reg(
    server,
    "db2_test_connection",
    {
      description: "Verify the DB2 z/OS connection and show the current location, SQLID and schema.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = await client.testConnection();
      return text(`${result.success ? "✅" : "❌"} ${result.message}`);
    },
  );
}
