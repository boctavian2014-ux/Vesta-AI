import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.warn("[drizzle.config] DATABASE_URL is unset — set it for drizzle-kit push/generate.");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: url || "postgresql://localhost:5432/vesta_web",
  },
});
