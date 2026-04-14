import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export const savedProperties = pgTable("saved_properties", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
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
  savedAt: timestamp("saved_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  propertyId: integer("property_id"),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  stripeSessionId: text("stripe_session_id"),
  stripeJobId: text("stripe_job_id"),
  pdfUrl: text("pdf_url"),
  referenciaCatastral: text("referencia_catastral"),
  address: text("address"),
  cadastralJson: text("cadastral_json"),
  financialJson: text("financial_json"),
  notaSimpleJson: text("nota_simple_json"),
  reportJson: text("report_json"),
  providerName: text("provider_name"),
  providerOrderId: text("provider_order_id"),
  providerStatus: text("provider_status"),
  providerRawJson: text("provider_raw_json"),
  requestedAt: text("requested_at"),
  completedAt: text("completed_at"),
  mapLat: text("map_lat"),
  mapLon: text("map_lon"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const reportStatusEvents = pgTable("report_status_events", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorEmail: text("actor_email"),
  actorName: text("actor_name"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
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

/** Drizzle `$inferInsert` avoids z.infer + drizzle-zod generic friction across Zod 3.24 / drizzle-zod 0.8. */
export type InsertUser = Pick<typeof users.$inferInsert, "username" | "password" | "email">;
export type User = typeof users.$inferSelect;
export type SavedProperty = typeof savedProperties.$inferSelect;
export type InsertSavedProperty = Omit<typeof savedProperties.$inferInsert, "id" | "savedAt">;
export type Report = typeof reports.$inferSelect;
export type InsertReport = Omit<typeof reports.$inferInsert, "id" | "createdAt">;
export type ReportStatusEvent = typeof reportStatusEvents.$inferSelect;
