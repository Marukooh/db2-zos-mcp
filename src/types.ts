export type TextContent = { type: "text"; text: string };
export type ToolResult = { content: TextContent[]; isError?: boolean };
export type ReadArgs = { sql: string; params?: unknown[]; maxRows?: number };
export type WriteArgs = { sql: string; params?: unknown[]; dry_run: boolean };
export type TablesArgs = { schema?: string };
export type ColumnsArgs = { table: string; schema?: string };
