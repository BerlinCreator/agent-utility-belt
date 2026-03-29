import { pgTable, text, timestamp, boolean, integer, jsonb, uuid, varchar, index, pgEnum, customType, numeric } from "drizzle-orm/pg-core";

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

// ─── Phase 4: Advanced API Tables ──────────────────────────────────

export const handoffStatusEnum = pgEnum("handoff_status", ["pending", "accepted", "rejected"]);

export const handoffs = pgTable("handoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromAgent: varchar("from_agent", { length: 255 }).notNull(),
  toAgent: varchar("to_agent", { length: 255 }).notNull(),
  task: text("task").notNull(),
  context: jsonb("context"),
  status: handoffStatusEnum("status").notNull().default("pending"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_handoffs_from_agent").on(table.fromAgent),
  index("idx_handoffs_to_agent").on(table.toAgent),
  index("idx_handoffs_status").on(table.status),
]);

export const escalationLevelEnum = pgEnum("escalation_level", ["low", "medium", "high", "critical"]);
export const escalationStatusEnum = pgEnum("escalation_status", ["open", "escalated", "resolved"]);

export const escalations = pgTable("escalations", {
  id: uuid("id").primaryKey().defaultRandom(),
  level: escalationLevelEnum("level").notNull(),
  context: text("context").notNull(),
  deadline: timestamp("deadline", { withTimezone: true }),
  status: escalationStatusEnum("status").notNull().default("open"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_escalations_level").on(table.level),
  index("idx_escalations_status").on(table.status),
]);

export const disputeStatusEnum = pgEnum("dispute_status", ["open", "review", "resolved"]);

export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  parties: jsonb("parties").notNull(),
  reason: text("reason").notNull(),
  status: disputeStatusEnum("status").notNull().default("open"),
  resolution: text("resolution"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_disputes_status").on(table.status),
]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "paid", "overdue", "cancelled"]);

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(),
  from: jsonb("from_party").notNull(),
  to: jsonb("to_party").notNull(),
  items: jsonb("items").notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_invoices_number").on(table.invoiceNumber),
  index("idx_invoices_status").on(table.status),
]);

export const contractStatusEnum = pgEnum("contract_status", ["draft", "active", "expired", "terminated"]);

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  parties: jsonb("parties").notNull(),
  templateId: varchar("template_id", { length: 100 }),
  content: text("content").notNull(),
  variables: jsonb("variables"),
  status: contractStatusEnum("status").notNull().default("draft"),
  effectiveDate: timestamp("effective_date", { withTimezone: true }),
  expirationDate: timestamp("expiration_date", { withTimezone: true }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_contracts_status").on(table.status),
  index("idx_contracts_template_id").on(table.templateId),
]);

export const expenseStatusEnum = pgEnum("expense_status", ["pending", "approved", "rejected", "reimbursed"]);

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: varchar("category", { length: 100 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  description: text("description"),
  date: timestamp("date", { withTimezone: true }).notNull(),
  status: expenseStatusEnum("status").notNull().default("pending"),
  receipt: text("receipt"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_expenses_category").on(table.category),
  index("idx_expenses_status").on(table.status),
  index("idx_expenses_date").on(table.date),
]);

export const bizSubscriptionStatusEnum = pgEnum("biz_subscription_status", ["active", "paused", "cancelled", "expired"]);
export const bizSubscriptionIntervalEnum = pgEnum("biz_subscription_interval", ["monthly", "quarterly", "yearly"]);

export const bizSubscriptions = pgTable("biz_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: varchar("customer_id", { length: 255 }).notNull(),
  planId: varchar("plan_id", { length: 255 }).notNull(),
  status: bizSubscriptionStatusEnum("status").notNull().default("active"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  interval: bizSubscriptionIntervalEnum("interval").notNull().default("monthly"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_biz_subscriptions_customer_id").on(table.customerId),
  index("idx_biz_subscriptions_status").on(table.status),
]);

export const ledgerEntryTypeEnum = pgEnum("ledger_entry_type", ["debit", "credit"]);

export const ledgerAccounts = pgTable("ledger_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  type: varchar("type", { length: 50 }).notNull(),
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_ledger_accounts_name").on(table.name),
  index("idx_ledger_accounts_type").on(table.type),
]);

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: varchar("transaction_id", { length: 100 }).notNull(),
  accountId: uuid("account_id").notNull().references(() => ledgerAccounts.id, { onDelete: "cascade" }),
  type: ledgerEntryTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_ledger_entries_transaction_id").on(table.transactionId),
  index("idx_ledger_entries_account_id").on(table.accountId),
  index("idx_ledger_entries_created_at").on(table.createdAt),
]);

export const payrollRuns = pgTable("payroll_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: varchar("employee_id", { length: 255 }).notNull(),
  employeeName: varchar("employee_name", { length: 255 }),
  hoursWorked: numeric("hours_worked", { precision: 8, scale: 2 }).notNull(),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).notNull(),
  grossPay: numeric("gross_pay", { precision: 12, scale: 2 }).notNull(),
  deductions: jsonb("deductions").notNull().default([]),
  totalDeductions: numeric("total_deductions", { precision: 12, scale: 2 }).notNull().default("0"),
  netPay: numeric("net_pay", { precision: 12, scale: 2 }).notNull(),
  payPeriodStart: timestamp("pay_period_start", { withTimezone: true }).notNull(),
  payPeriodEnd: timestamp("pay_period_end", { withTimezone: true }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_payroll_runs_employee_id").on(table.employeeId),
  index("idx_payroll_runs_created_at").on(table.createdAt),
]);

export const couponTypeEnum = pgEnum("coupon_type", ["percentage", "fixed"]);

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  type: couponTypeEnum("type").notNull(),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  minPurchase: numeric("min_purchase", { precision: 12, scale: 2 }),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_coupons_code").on(table.code),
  index("idx_coupons_is_active").on(table.isActive),
]);

export const refundStatusEnum = pgEnum("refund_status", ["requested", "approved", "processing", "completed", "rejected"]);

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  status: refundStatusEnum("status").notNull().default("requested"),
  processedBy: varchar("processed_by", { length: 255 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_refunds_invoice_id").on(table.invoiceId),
  index("idx_refunds_status").on(table.status),
]);

export const inventoryItems = pgTable("inventory_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  sku: varchar("sku", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull().default(0),
  reservedQuantity: integer("reserved_quantity").notNull().default(0),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_inventory_items_sku").on(table.sku),
]);

export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected"]);

export const approvalRequests = pgTable("approval_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: varchar("type", { length: 100 }).notNull(),
  requesterId: varchar("requester_id", { length: 255 }).notNull(),
  data: jsonb("data").notNull(),
  status: approvalStatusEnum("approval_status").notNull().default("pending"),
  decidedBy: varchar("decided_by", { length: 255 }),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_approval_requests_type").on(table.type),
  index("idx_approval_requests_status").on(table.status),
  index("idx_approval_requests_requester_id").on(table.requesterId),
]);
