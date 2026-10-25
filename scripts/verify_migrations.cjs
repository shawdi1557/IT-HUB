#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");
if (!fs.existsSync(migrationsDir)) {
  console.error("::error::Migrations directory not found at", migrationsDir);
  process.exit(1);
}

const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
if (files.length === 0) {
  console.error("::error::No migration files found in", migrationsDir);
  process.exit(1);
}

const pattern = /^(\d{14})_([a-zA-Z0-9_]+)\.sql$/;
let lastTimestamp = "";
let hasErrors = false;

for (const file of files) {
  const match = file.match(pattern);
  if (!match) {
    console.error(
      `::error::Migration filename "${file}" does not follow YYYYMMDDHHMMSS_name.sql format.`,
    );
    hasErrors = true;
    continue;
  }

  const timestamp = match[1];
  if (timestamp <= lastTimestamp) {
    console.error(
      `::error::Migration "${file}" timestamp (${timestamp}) is not strictly greater than previous (${lastTimestamp}).`,
    );
    hasErrors = true;
  }
  lastTimestamp = timestamp;

  const fullPath = path.join(migrationsDir, file);
  const stats = fs.statSync(fullPath);
  if (stats.size === 0) {
    console.error(`::error::Migration file "${file}" is empty.`);
    hasErrors = true;
  }
}

const schemaFile = path.join(__dirname, "..", "supabase", "schema.sql");
if (!fs.existsSync(schemaFile) || fs.statSync(schemaFile).size === 0) {
  console.error("::error::supabase/schema.sql is missing or empty.");
  hasErrors = true;
}

if (hasErrors) {
  console.error("Migration verification failed.");
  process.exit(1);
}

console.log(
  `Verified ${files.length} sequential database migrations and canonical schema.sql successfully.`,
);
