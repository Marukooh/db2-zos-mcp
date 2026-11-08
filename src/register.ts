import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolResult } from "./types.js";

/**
 * Thin wrapper around McpServer.registerTool that avoids TS2589 ("type instantiation is
 * excessively deep") from the Zod generics. The SDK still validates args at runtime;
 * handlers cast rawArgs to their own arg type.
 */
export function reg(
  server: McpServer,
  name: string,
  config: Record<string, unknown>,
  handler: (rawArgs: unknown) => Promise<ToolResult>,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool(name, config, handler);
}
