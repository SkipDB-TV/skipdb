import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url =
  process.env.DATABASE_URL ??
  "postgresql://skipdb:skipdb@localhost:5433/skipdb";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
