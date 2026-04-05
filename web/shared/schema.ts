import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  createdAt: text("created_at").notNull().default("now"),
});

export const savedProperties = sqliteTable("saved_properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  referenciaCatastral: text("referencia_catastral"),
  address: text("address"),
  lat: text("lat"),
  lon: text("lon"),
  pricePerSqm: text("price_per_sqm"),
  avgRentPerSqm: text("avg_rent_per_sqm"),
  grossYield: text("gross_yield"),
  netYield: text("net_yield"),
  roi: text("roi"),
  opportunityScore: text("opportunity_score"),
  savedAt: text("saved_at").notNull().default("now"),
});

export const reports = sqliteTable("reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  propertyId: integer("property_id"),
  type: text("type").notNull(), // 'nota_simple' | 'expert_report'
  status: text("status").notNull().default("pending"), // pending | processing | completed | failed
  stripeSessionId: text("stripe_session_id"),
  stripeJobId: text("stripe_job_id"),           // async job_id from /report/generate-async
  referenciaCatastral: text("referencia_catastral"),
  address: text("address"),
  cadastralJson: text("cadastral_json"),         // full JSON from identify
  financialJson: text("financial_json"),         // full JSON from financial-analysis
  notaSimpleJson: text("nota_simple_json"),      // extracted Nota Simple data
  reportJson: text("report_json"),               // full completed async report JSON
  createdAt: text("created_at").notNull().default("now"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  username: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

export const insertSavedPropertySchema = createInsertSchema(savedProperties).omit({
  id: true,
  savedAt: true,
});

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type SavedProperty = typeof savedProperties.$inferSelect;
export type InsertSavedProperty = z.infer<typeof insertSavedPropertySchema>;
export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;
