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
}

export const storage = new DatabaseStorage();
