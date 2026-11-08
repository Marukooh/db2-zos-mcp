# db2-zos-mcp

MCP (Model Context Protocol) server for **IBM DB2 for z/OS**. Lets any MCP client (Claude Desktop, Claude Code, VS Code / GitHub Copilot, Cursor, …) query a DB2 z/OS subsystem, browse the catalog and — with an explicit two-step confirmation — run write/DDL statements.

## Prerequisites

- Node.js 18+
- Network access to the DB2 z/OS DRDA port (often 446).
- A DB2 Connect license for z/OS targets (the `db2consv_*.lic` file in the driver's `license` folder), as required by IBM.

`ibm_db` downloads the IBM CLI driver automatically on install. To use an existing driver instead, set `IBM_DB_HOME` to its path before installing.

## Quick start

```bash
npx -y db2-zos-mcp
```

The server talks over stdio, so normally the MCP client starts it for you with the configuration below.

## Client configuration

### Claude Desktop / Cursor / most clients (`mcpServers`)

```json
{
  "mcpServers": {
    "db2-zos": {
      "command": "npx",
      "args": ["-y", "db2-zos-mcp"],
      "env": {
        "DB2_URL": "db2://db2.example.com:446/LOCATION",
        "DB2_USERNAME": "myuser",
        "DB2_PASSWORD": "mypassword",
        "DB2_SCHEMA": "MYSCHEMA"
      }
    }
  }
}
```

### VS Code / GitHub Copilot (`.vscode/mcp.json`)

```json
{
  "inputs": [
    { "id": "db2-password", "type": "promptString", "description": "DB2 password", "password": true }
  ],
  "servers": {
    "db2-zos": {
      "command": "npx",
      "args": ["-y", "db2-zos-mcp"],
      "env": {
        "DB2_HOST": "db2.example.com",
        "DB2_PORT": "446",
        "DB2_DATABASE": "LOCATION",
        "DB2_USERNAME": "myuser",
        "DB2_PASSWORD": "${input:db2-password}",
        "DB2_CURRENT_SCHEMA": "MYSCHEMA"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add db2-zos -e DB2_URL=db2://db2.example.com:446/LOCATION -e DB2_USERNAME=myuser -e DB2_PASSWORD=mypassword -- npx -y db2-zos-mcp
```

> Avoid committing passwords: use your client's secret/input mechanism where available.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB2_URL` | ✅ (or HOST + DATABASE) | — | `db2://host:port/location` — takes priority over the individual params |
| `DB2_HOST` | ✅ if no URL | — | Hostname or IP |
| `DB2_PORT` | ❌ | `446` | DRDA port (ignored when `DB2_URL` is set) |
| `DB2_DATABASE` | ✅ if no URL | — | DB2 location name (ignored when `DB2_URL` is set) |
| `DB2_USERNAME` | ✅ | — | User ID |
| `DB2_PASSWORD` | ✅ | — | Password (special characters such as `;` are handled) |
| `DB2_SCHEMA` | ❌ | — | Default schema for `db2_get_tables` / `db2_get_columns` |
| `DB2_CURRENT_SCHEMA` | ❌ | — | Sets the `CURRENT SCHEMA` special register for unqualified SQL |
| `DB2_SSL` | ❌ | `true` | Use TLS (`true` / `false`) |
| `DB2_SSL_SERVER_CERTIFICATE` | ❌ | — | Path to the server CA certificate (`.arm` / `.pem`) |
| `DB2_CONNECT_TIMEOUT` | ❌ | `30` | Connection timeout, seconds |
| `DB2_QUERY_TIMEOUT` | ❌ | `60` | Query timeout, seconds |

## Tools

| Tool | Description |
|---|---|
| `db2_read` | Run a `SELECT` / `WITH` / `VALUES` query. Rows are streamed and capped by `maxRows` (default 100, max 10 000), so large tables are not pulled into memory |
| `db2_write` | Run `INSERT` / `UPDATE` / `DELETE` / `MERGE` / DDL / `CALL`. Must be called with `dry_run=true` first; reports affected rows |
| `db2_get_tables` | List tables, views and aliases from `SYSIBM.SYSTABLES` |
| `db2_get_columns` | Column definitions from `SYSIBM.SYSCOLUMNS` |
| `db2_get_schemas` | List non-system schemas |
| `db2_test_connection` | Check connectivity and show location, `CURRENT SQLID` and `CURRENT SCHEMA` |

## Safety

- `db2_read` accepts only single read statements; `SELECT … FROM FINAL/NEW/OLD TABLE (INSERT/UPDATE/DELETE …)` is rejected because it changes data.
- Keywords inside string literals and comments are ignored by the checks, so `WHERE NOTE = 'a; DROP'` is not misread.
- Catalog lookups use bound parameters, never string concatenation.
- For real protection, connect with a user whose DB2 privileges match what the assistant should be allowed to do — the guards above are a convenience, not a security boundary.

## Development

```bash
npm install
npm test
```

## License

MIT
