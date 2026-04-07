import {
  type User, type InsertUser, users,
  type SavedProperty, type InsertSavedProperty, savedProperties,
  type Report, type InsertReport, reports,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

function ensureSchema() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT 'now'
    );

    CREATE TABLE IF NOT EXISTS saved_properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      referencia_catastral TEXT,
      address TEXT,
      lat TEXT,
      lon TEXT,
      price_per_sqm TEXT,
      avg_rent_per_sqm TEXT,
      gross_yield TEXT,
      net_yield TEXT,
      roi TEXT,
      opportunity_score TEXT,
      saved_at TEXT NOT NULL DEFAULT 'now',
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      property_id INTEGER,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      stripe_session_id TEXT,
      stripe_job_id TEXT,
      referencia_catastral TEXT,
      address TEXT,
      cadastral_json TEXT,
      financial_json TEXT,
      nota_simple_json TEXT,
      report_json TEXT,
      created_at TEXT NOT NULL DEFAULT 'now',
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

ensureSchema();

export const db = drizzle(sqlite);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getSavedProperties(userId: number): Promise<SavedProperty[]>;
  saveProperty(property: InsertSavedProperty): Promise<SavedProperty>;
  deleteProperty(id: number, userId: number): Promise<void>;
  getReports(userId: number): Promise<Report[]>;
  getReport(id: number, userId: number): Promise<Report | undefined>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(id: number, userId: number, data: Partial<Report>): Promise<Report | undefined>;
  updateReportStatus(id: number, status: string): Promise<void>;
  /** Legătură cu PaymentIntent Python (`stripe_session_id` pe DetailedReport). */
  updateReportByStripeSessionId(
    stripeSessionId: string,
    data: Partial<Pick<Report, "status" | "reportJson" | "notaSimpleJson" | "stripeJobId">>
  ): Promise<Report | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.email, email)).get();
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return db.insert(users).values({
      ...insertUser,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  async getSavedProperties(userId: number): Promise<SavedProperty[]> {
    return db.select().from(savedProperties).where(eq(savedProperties.userId, userId)).all();
  }

  async saveProperty(property: InsertSavedProperty): Promise<SavedProperty> {
    return db.insert(savedProperties).values({
      ...property,
      savedAt: new Date().toISOString(),
    }).returning().get();
  }

  async deleteProperty(id: number, userId: number): Promise<void> {
    db.delete(savedProperties).where(
      and(eq(savedProperties.id, id), eq(savedProperties.userId, userId))
    ).run();
  }

  async getReports(userId: number): Promise<Report[]> {
    return db.select().from(reports).where(eq(reports.userId, userId)).all();
  }

  async getReport(id: number, userId: number): Promise<Report | undefined> {
    return db.select().from(reports).where(and(eq(reports.id, id), eq(reports.userId, userId))).get();
  }

  async createReport(report: InsertReport): Promise<Report> {
    return db.insert(reports).values({
      ...report,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  async updateReport(id: number, userId: number, data: Partial<Report>): Promise<Report | undefined> {
    db.update(reports).set(data).where(and(eq(reports.id, id), eq(reports.userId, userId))).run();
    return db.select().from(reports).where(and(eq(reports.id, id), eq(reports.userId, userId))).get();
  }

  async updateReportStatus(id: number, status: string): Promise<void> {
    db.update(reports).set({ status }).where(eq(reports.id, id)).run();
  }

  async updateReportByStripeSessionId(
    stripeSessionId: string,
    data: Partial<Pick<Report, "status" | "reportJson" | "notaSimpleJson" | "stripeJobId">>
  ): Promise<Report | undefined> {
    const row = db.select().from(reports).where(eq(reports.stripeSessionId, stripeSessionId)).get();
    if (!row) return undefined;
    const cleaned = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    ) as Partial<Report>;
    if (Object.keys(cleaned).length === 0) return row;
    db.update(reports).set(cleaned).where(eq(reports.id, row.id)).run();
    return db.select().from(reports).where(eq(reports.id, row.id)).get();
  }
}

export const storage = new DatabaseStorage();
