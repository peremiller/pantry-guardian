import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pantryDonations = sqliteTable("pantry_donations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  foodName: text("food_name").notNull(),
  quantity: text("quantity").notNull(),
  expiryDate: text("expiry_date").notNull(),
  pickupArea: text("pickup_area").notNull(),
  pickupDetails: text("pickup_details").notNull().default(""),
  donorName: text("donor_name").notNull().default("Community member"),
  contact: text("contact").notNull().default(""),
  note: text("note").notNull().default(""),
  image: text("image"),
  claimed: integer("claimed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
