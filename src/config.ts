export interface Db2Config {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  schema?: string;
  ssl: boolean;
  sslServerCertificate?: string;
  currentSchema?: string;
  connectTimeout: number;
  queryTimeout: number;
}

// Parses: db2://host:port/database
const DB2_URL_PATTERN = /^db2:\/\/([^/:]+)(?::(\d+))?\/([^?/]+)\/?$/i;

function parseDb2Url(url: string): { host: string; port: number; database: string } {
  const match = DB2_URL_PATTERN.exec(url.trim());
  if (!match) {
    throw new Error(`Invalid DB2_URL format. Expected: db2://hostname:port/database`);
  }
  const [, host, portStr, database] = match;
  return { host, port: portStr ? Number(portStr) : 446, database: database.trim() };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable ${name} is not set`);
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative integer (got "${raw}")`);
  }
  return value;
}

function resolveHostPortDatabase(): { host: string; port: number; database: string } {
  const url = process.env["DB2_URL"];
  if (url) return parseDb2Url(url);
  return {
    host: requireEnv("DB2_HOST"),
    port: intEnv("DB2_PORT", 446),
    database: requireEnv("DB2_DATABASE"),
  };
}

export function loadConfig(): Db2Config {
  const { host, port, database } = resolveHostPortDatabase();
  return {
    host,
    port,
    database,
    username: requireEnv("DB2_USERNAME"),
    password: requireEnv("DB2_PASSWORD"),
    schema: process.env["DB2_SCHEMA"] || undefined,
    ssl: process.env["DB2_SSL"]?.toLowerCase() !== "false",
    sslServerCertificate: process.env["DB2_SSL_SERVER_CERTIFICATE"] || undefined,
    currentSchema: process.env["DB2_CURRENT_SCHEMA"] || undefined,
    connectTimeout: intEnv("DB2_CONNECT_TIMEOUT", 30),
    queryTimeout: intEnv("DB2_QUERY_TIMEOUT", 60),
  };
}

// CLI connection-string values containing ';' or braces must be wrapped in {} (e.g. passwords).
function kv(key: string, value: string | number): string {
  const v = String(value);
  return /[;{}]/.test(v) ? `${key}={${v.replace(/}/g, "}}")}}` : `${key}=${v}`;
}

export function buildConnectionString(config: Db2Config): string {
  const parts = [
    kv("DATABASE", config.database),
    kv("HOSTNAME", config.host),
    kv("PORT", config.port),
    "PROTOCOL=TCPIP",
    kv("UID", config.username),
    kv("PWD", config.password),
    kv("ConnectTimeout", config.connectTimeout),
    kv("QueryTimeout", config.queryTimeout),
  ];
  if (config.ssl) {
    parts.push("Security=SSL");
    if (config.sslServerCertificate) parts.push(kv("SSLServerCertificate", config.sslServerCertificate));
  }
  if (config.currentSchema) parts.push(kv("CurrentSchema", config.currentSchema));
  return parts.join(";") + ";";
}
