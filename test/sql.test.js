const { test } = require("node:test");
const assert = require("node:assert");
const { classifySQL, assertReadOnly, assertWrite, normalizeSql } = require("../dist/sql.js");
const { buildConnectionString } = require("../dist/config.js");

test("classifies statements", () => {
  assert.equal(classifySQL("SELECT 1 FROM SYSIBM.SYSDUMMY1"), "read");
  assert.equal(classifySQL("-- note\n  with x as (select 1 from t) select * from x"), "read");
  assert.equal(classifySQL("/* c */ UPDATE T SET A = 1"), "write");
  assert.equal(classifySQL("SELECT * FROM FINAL TABLE (INSERT INTO T VALUES (1))"), "write");
  assert.equal(classifySQL("EXPLAIN PLAN FOR SELECT 1"), "unknown");
});

test("read guard", () => {
  assert.doesNotThrow(() => assertReadOnly("SELECT 'a;b' FROM T;"));
  assert.doesNotThrow(() => assertReadOnly("SELECT 'final table (' FROM T"));
  assert.throws(() => assertReadOnly("SELECT 1 FROM T; DELETE FROM T"), /Multiple/);
  assert.throws(() => assertReadOnly("DELETE FROM T"), /Only SELECT/);
  assert.throws(() => assertReadOnly("SELECT * FROM OLD TABLE (DELETE FROM T)"), /Only SELECT/);
});

test("write guard", () => {
  assert.doesNotThrow(() => assertWrite("INSERT INTO T VALUES ('x;y')"));
  assert.throws(() => assertWrite("SELECT 1 FROM T"), /db2_read/);
  assert.throws(() => assertWrite("FOO BAR"), /Unrecognised/);
});

test("normalizeSql strips one trailing semicolon", () => {
  assert.equal(normalizeSql("  SELECT 1 FROM T ;  "), "SELECT 1 FROM T");
});

test("connection string escapes special characters", () => {
  const cs = buildConnectionString({
    host: "h", port: 446, database: "D", username: "u", password: "p;w}d", ssl: true,
    connectTimeout: 30, queryTimeout: 60,
  });
  assert.match(cs, /PWD=\{p;w\}\}d\};/);
  assert.match(cs, /Security=SSL;$/);
});
