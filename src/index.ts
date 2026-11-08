#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { Db2Client } from "./db2.js";
import { registerReadTool } from "./tools/read.js";
import { registerWriteTool } from "./tools/write.js";
import { registerCatalogTools } from "./tools/catalog.js";
import { registerConnectionTool } from "./tools/connection.js";

const { version } = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as { version: string };

async function main(): Promise<void> {
  const client = new Db2Client(loadConfig());
  const server = new McpServer({ name: "db2-zos-mcp", version });

  registerReadTool(server, client);
  registerWriteTool(server, client);
  registerCatalogTools(server, client);
  registerConnectionTool(server, client);

  const shutdown = async () => {
    await client.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.stdin.on("end", shutdown);

  await server.connect(new StdioServerTransport());
  process.stderr.write(`db2-zos-mcp ${version} running on stdio\n`);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
