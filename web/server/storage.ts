import {
  type User,
  type InsertUser,
  users,
  type SavedProperty,
  type InsertSavedProperty,
  savedProperties,
  type Report,
  type InsertReport,
  reports,
  type ReportStatusEvent,
  reportStatusEvents,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getDb } from "./db";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  updateUserPassword(userId: number, passwordHash: string): Promise<void>;
  createUser(user: InsertUser): Promise<User>;
  getSavedProperties(userId: number): Promise<SavedProperty[]>;
  saveProperty(property: InsertSavedProperty): Promise<SavedProperty>;
  deleteProperty(id: number, userId: number): Promise<void>;
  getReports(userId: number): Promise<Report[]>;
  getReport(id: number, userId: number): Promise<Report | undefined>;
  getReportAdmin(id: number): Promise<Report | undefined>;
  getReportByProviderOrderId(providerOrderId: string): Promise<Report | undefined>;
  getAllReports(): Promise<Report[]>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(id: number, userId: number, data: Partial<Report>): Promise<Report | undefined>;
  updateReportAdmin(id: number, data: Partial<Report>): Promise<Report | undefined>;
  updateReportByProviderOrderId(providerOrderId: string, data: Partial<Report>): Promise<Report | undefined>;
  updateReportStatus(id: number, status: string): Promise<void>;
  updateReportByStripeSessionId(
    stripeSessionId: string,
    data: Partial<Pick<Report, "status" | "reportJson" | "notaSimpleJson" | "stripeJobId" | "pdfUrl">>
  ): Promise<Report | undefined>;
  createReportStatusEvent(event: Omit<ReportStatusEvent, "id" | "createdAt">): Promise<ReportStatusEvent>;
  getReportStatusEvents(reportId: number): Promise<ReportStatusEvent[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return rows[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0];
  }

  async updateUserPassword(userId: number, passwordHash: string): Promise<void> {
    const db = getDb();
    await db.update(users).set({ password: passwordHash }).where(eq(users.id, userId));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const db = getDb();
    const [row] = await db.insert(users).values(insertUser).returning();
    return row;
  }

  async getSavedProperties(userId: number): Promise<SavedProperty[]> {
    const db = getDb();
    return db.select().from(savedProperties).where(eq(savedProperties.userId, userId));
  }

  async saveProperty(property: InsertSavedProperty): Promise<SavedProperty> {
    const db = getDb();
    const [row] = await db.insert(savedProperties).values(property).returning();
    return row;
  }

  async deleteProperty(id: number, userId: number): Promise<void> {
    const db = getDb();
    await db
      .delete(savedProperties)
      .where(and(eq(savedProperties.id, id), eq(savedProperties.userId, userId)));
  }

  async getReports(userId: number): Promise<Report[]> {
    const db = getDb();
    return db.select().from(reports).where(eq(reports.userId, userId));
  }

  async getReport(id: number, userId: number): Promise<Report | undefined> {
    const db = getDb();
    const rows = await db
      .select()
      .from(reports)
      .where(and(eq(reports.id, id), eq(reports.userId, userId)))
      .limit(1);
    return rows[0];
  }

  async getReportAdmin(id: number): Promise<Report | undefined> {
    const db = getDb();
    const rows = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    return rows[0];
  }

  async getReportByProviderOrderId(providerOrderId: string): Promise<Report | undefined> {
    const db = getDb();
    const rows = await db
      .select()
      .from(reports)
      .where(eq(reports.providerOrderId, providerOrderId))
      .limit(1);
    return rows[0];
  }

  async getAllReports(): Promise<Report[]> {
    const db = getDb();
    return db.select().from(reports);
  }

  async createReport(report: InsertReport): Promise<Report> {
    const db = getDb();
    const [row] = await db.insert(reports).values(report).returning();
    return row;
  }

  async updateReport(id: number, userId: number, data: Partial<Report>): Promise<Report | undefined> {
    const db = getDb();
    await db.update(reports).set(data).where(and(eq(reports.id, id), eq(reports.userId, userId)));
    const rows = await db
      .select()
      .from(reports)
      .where(and(eq(reports.id, id), eq(reports.userId, userId)))
      .limit(1);
    return rows[0];
  }

  async updateReportAdmin(id: number, data: Partial<Report>): Promise<Report | undefined> {
    const db = getDb();
    await db.update(reports).set(data).where(eq(reports.id, id));
    const rows = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    return rows[0];
  }

  async updateReportByProviderOrderId(providerOrderId: string, data: Partial<Report>): Promise<Report | undefined> {
    const row = await this.getReportByProviderOrderId(providerOrderId);
    if (!row) return undefined;
    const db = getDb();
    await db.update(reports).set(data).where(eq(reports.id, row.id));
    const rows = await db.select().from(reports).where(eq(reports.id, row.id)).limit(1);
    return rows[0];
  }

  async updateReportStatus(id: number, status: string): Promise<void> {
    const db = getDb();
    await db.update(reports).set({ status }).where(eq(reports.id, id));
  }

  async updateReportByStripeSessionId(
    stripeSessionId: string,
    data: Partial<Pick<Report, "status" | "reportJson" | "notaSimpleJson" | "stripeJobId" | "pdfUrl">>
  ): Promise<Report | undefined> {
    const db = getDb();
    const rows = await db
      .select()
      .from(reports)
      .where(eq(reports.stripeSessionId, stripeSessionId))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    const cleaned = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    ) as Partial<Report>;
    if (Object.keys(cleaned).length === 0) return row;
    await db.update(reports).set(cleaned).where(eq(reports.id, row.id));
    const out = await db.select().from(reports).where(eq(reports.id, row.id)).limit(1);
    return out[0];
  }

  async createReportStatusEvent(
    event: Omit<ReportStatusEvent, "id" | "createdAt">
  ): Promise<ReportStatusEvent> {
    const db = getDb();
    const [row] = await db.insert(reportStatusEvents).values(event).returning();
    return row;
  }

  async getReportStatusEvents(reportId: number): Promise<ReportStatusEvent[]> {
    const db = getDb();
    const list = await db
      .select()
      .from(reportStatusEvents)
      .where(eq(reportStatusEvents.reportId, reportId));
    return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}

export const storage = new DatabaseStorage();
