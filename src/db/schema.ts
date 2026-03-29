import { pgTable, text, timestamp, boolean, integer, jsonb, uuid, varchar, index, pgEnum, customType } from "drizzle-orm/pg-core";

export const tierEnum = pgEnum("tier", ["free", "starter", "growth", "business", "enterprise"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  passwordHash: text("password_hash"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull().default("Default"),
  tier: tierEnum("tier").notNull().default("free"),
  isActive: boolean("is_active").notNull().default(true),
  callsThisMonth: integer("calls_this_month").notNull().default(0),
  monthlyLimit: integer("monthly_limit").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (table) => [
  index("idx_api_keys_key").on(table.key),
  index("idx_api_keys_user_id").on(table.userId),
]);

export const usageLogs = pgTable("usage_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  apiKeyId: uuid("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
  endpoint: varchar("endpoint", { length: 255 }).notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  statusCode: integer("status_code").notNull(),
  responseTimeMs: integer("response_time_ms").notNull(),
  requestMeta: jsonb("request_meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_usage_logs_api_key_id").on(table.apiKeyId),
  index("idx_usage_logs_created_at").on(table.createdAt),
  index("idx_usage_logs_endpoint").on(table.endpoint),
]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tier: tierEnum("tier").notNull().default("free"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shortUrls = pgTable("short_urls", {
  id: uuid("id").primaryKey().defaultRandom(),
  apiKeyId: uuid("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
  shortCode: varchar("short_code", { length: 20 }).notNull().unique(),
  originalUrl: text("original_url").notNull(),
  clicks: integer("clicks").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_short_urls_short_code").on(table.shortCode),
  index("idx_short_urls_api_key_id").on(table.apiKeyId),
]);

// ─── Phase 1: Agent Kernel Tables ──────────────────────────────────

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const heartbeatStatusEnum = pgEnum("heartbeat_status", ["alive", "stale", "dead"]);

export const heartbeats = pgTable("heartbeats", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: varchar("agent_id", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  lastPing: timestamp("last_ping", { withTimezone: true }).notNull().defaultNow(),
  staleThresholdMs: integer("stale_threshold_ms").notNull().default(30000),
  deadThresholdMs: integer("dead_threshold_ms").notNull().default(120000),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_heartbeats_agent_id").on(table.agentId),
]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: varchar("actor", { length: 255 }).notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  resource: varchar("resource", { length: 255 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_audit_logs_actor").on(table.actor),
  index("idx_audit_logs_action").on(table.action),
  index("idx_audit_logs_created_at").on(table.createdAt),
]);

export const gates = pgTable("gates", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  rolloutPercentage: integer("rollout_percentage").notNull().default(100),
  description: varchar("description", { length: 500 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_gates_key").on(table.key),
]);

export const checkpoints = pgTable("checkpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: varchar("agent_id", { length: 255 }).notNull(),
  state: jsonb("state").notNull(),
  metadata: jsonb("metadata"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_checkpoints_agent_id").on(table.agentId),
  index("idx_checkpoints_created_at").on(table.createdAt),
]);

export const kvStore = pgTable("kv_store", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 512 }).notNull().unique(),
  value: jsonb("value").notNull(),
  ttl: integer("ttl"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_kv_store_key").on(table.key),
  index("idx_kv_store_expires_at").on(table.expiresAt),
]);

export const blobStore = pgTable("blob_store", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: varchar("filename", { length: 512 }).notNull(),
  contentType: varchar("content_type", { length: 255 }).notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_blob_store_filename").on(table.filename),
]);

export const secrets = pgTable("secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  ciphertext: text("ciphertext").notNull(),
  iv: varchar("iv", { length: 64 }).notNull(),
  authTag: varchar("auth_tag", { length: 64 }).notNull(),
  version: integer("version").notNull().default(1),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_secrets_name").on(table.name),
]);

export const policies = pgTable("policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: varchar("description", { length: 500 }),
  rules: jsonb("rules").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_policies_name").on(table.name),
]);

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  events: jsonb("events").notNull().default([]),
  secret: varchar("secret", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_webhooks_is_active").on(table.isActive),
]);

export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", ["pending", "success", "failed"]);

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  webhookId: uuid("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  payload: jsonb("payload").notNull(),
  status: webhookDeliveryStatusEnum("status").notNull().default("pending"),
  statusCode: integer("status_code"),
  response: text("response"),
  attempts: integer("attempts").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_webhook_deliveries_webhook_id").on(table.webhookId),
  index("idx_webhook_deliveries_status").on(table.status),
]);

export const scheduleStatusEnum = pgEnum("schedule_status", ["active", "paused", "completed"]);

// ─── Phase 2: Agent Utility Tables ──────────────────────────────────

export const traces = pgTable("traces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  metadata: jsonb("metadata"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_traces_status").on(table.status),
]);

export const spans = pgTable("spans", {
  id: uuid("id").primaryKey().defaultRandom(),
  traceId: uuid("trace_id").notNull().references(() => traces.id, { onDelete: "cascade" }),
  parentSpanId: uuid("parent_span_id"),
  name: varchar("name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("ok"),
  metadata: jsonb("metadata"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_spans_trace_id").on(table.traceId),
]);

export const annotations = pgTable("annotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  target: varchar("target", { length: 255 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  body: text("body"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_annotations_target").on(table.target),
  index("idx_annotations_label").on(table.label),
]);

export const feedbacks = pgTable("feedbacks", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: varchar("entity_id", { length: 255 }).notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  tags: jsonb("tags"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_feedbacks_entity_id").on(table.entityId),
]);

export const schedules = pgTable("schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }),
  cronExpression: varchar("cron_expression", { length: 100 }).notNull(),
  callbackUrl: text("callback_url").notNull(),
  payload: jsonb("payload"),
  status: scheduleStatusEnum("status").notNull().default("active"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_schedules_status").on(table.status),
  index("idx_schedules_next_run_at").on(table.nextRunAt),
]);
