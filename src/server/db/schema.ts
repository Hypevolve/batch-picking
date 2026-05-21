import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
  jsonb,
  real,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "picker"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending_batch",
  "batched",
  "picked",
  "packed",
  "synced",
]);
export const batchTypeEnum = pgEnum("batch_type", [
  "smart",
  "mixed",
  "partial",
]);
export const batchStatusEnum = pgEnum("batch_status", [
  "draft",
  "ready",
  "in_progress",
  "picked",
  "packed",
  "synced",
]);
export const basketLabelEnum = pgEnum("basket_label", [
  "A",
  "B",
  "C",
  "D",
  "E",
]);

// Tables
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("picker"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    wooProductId: integer("woo_product_id").unique(),
    sku: varchar("sku", { length: 100 }).notNull().unique(),
    title: text("title").notNull(),
    imageUrl: text("image_url"),
    author: text("author"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("products_sku_idx").on(table.sku)]
);

export const productLocations = pgTable("product_locations", {
  id: serial("id").primaryKey(),
  sku: varchar("sku", { length: 100 })
    .notNull()
    .references(() => products.sku),
  zoneCode: varchar("zone_code", { length: 50 }).notNull(),
  shelfCode: varchar("shelf_code", { length: 50 }).notNull(),
  routePosition: integer("route_position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pickingRoutes = pgTable("picking_routes", {
  id: serial("id").primaryKey(),
  zoneCode: varchar("zone_code", { length: 50 }).notNull().unique(),
  zoneName: varchar("zone_name", { length: 255 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    wooOrderId: integer("woo_order_id").notNull().unique(),
    customerName: varchar("customer_name", { length: 255 }).notNull(),
    status: orderStatusEnum("status").notNull().default("pending_batch"),
    wooStatus: varchar("woo_status", { length: 50 }).notNull(),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("orders_woo_order_id_idx").on(table.wooOrderId)]
);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  sku: varchar("sku", { length: 100 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  productTitleSnapshot: text("product_title_snapshot"),
  productImageSnapshot: text("product_image_snapshot"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  batchCode: varchar("batch_code", { length: 50 }).notNull().unique(),
  batchType: batchTypeEnum("batch_type").notNull().default("mixed"),
  similarityScore: real("similarity_score").default(0),
  status: batchStatusEnum("status").notNull().default("draft"),
  orderCount: integer("order_count").notNull().default(0),
  totalItems: integer("total_items").notNull().default(0),
  totalQuantity: integer("total_quantity").notNull().default(0),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const batchOrders = pgTable("batch_orders", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id")
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  basketLabel: basketLabelEnum("basket_label").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const batchItems = pgTable("batch_items", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id")
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  sku: varchar("sku", { length: 100 }).notNull(),
  productTitle: text("product_title"),
  productImageUrl: text("product_image_url"),
  totalQuantity: integer("total_quantity").notNull().default(0),
  basketBreakdown: jsonb("basket_breakdown").$type<Record<string, number>>(),
  routePosition: integer("route_position").notNull().default(0),
  zoneCode: varchar("zone_code", { length: 50 }),
  shelfCode: varchar("shelf_code", { length: 50 }),
  isPicked: boolean("is_picked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id").notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductLocation = typeof productLocations.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type BatchOrder = typeof batchOrders.$inferSelect;
export type BatchItem = typeof batchItems.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
