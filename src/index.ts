import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import { imageRoutes } from "./routes/commodity/image.js";
import { pdfRoutes } from "./routes/commodity/pdf.js";
import { qrRoutes } from "./routes/commodity/qr.js";
import { emailValidatorRoutes } from "./routes/commodity/email-validator.js";
import { urlShortenerRoutes, urlRedirectRoutes } from "./routes/commodity/url-shortener.js";
import { currencyRoutes } from "./routes/commodity/currency.js";
import { ipGeoRoutes } from "./routes/commodity/ip-geo.js";
import { stringUtilRoutes } from "./routes/commodity/string-utils.js";
import { translationRoutes } from "./routes/commodity/translation.js";
import { webExtractRoutes } from "./routes/high-demand/web-extract.js";
import { socialDataRoutes } from "./routes/high-demand/social-data.js";
import { leadEnrichmentRoutes } from "./routes/high-demand/lead-enrichment.js";
import { serpAnalyzerRoutes } from "./routes/high-demand/serp-analyzer.js";
import { siteMonitorRoutes } from "./routes/high-demand/site-monitor.js";
import { priceTrackerRoutes } from "./routes/high-demand/price-tracker.js";
import { reviewAggregatorRoutes } from "./routes/high-demand/review-aggregator.js";
import { rateOracleRoutes } from "./routes/first-to-market/rate-oracle.js";
import { patentSearchRoutes } from "./routes/first-to-market/patent-search.js";
import { paperSearchRoutes } from "./routes/first-to-market/paper-search.js";
import { companyDataRoutes } from "./routes/first-to-market/company-data.js";
import { productScraperRoutes } from "./routes/first-to-market/product-scraper.js";
import { sentimentRoutes } from "./routes/first-to-market/sentiment.js";
import { resumeParserRoutes } from "./routes/first-to-market/resume-parser.js";
import { salaryDataRoutes } from "./routes/first-to-market/salary-data.js";
import { taxLookupRoutes } from "./routes/first-to-market/tax-lookup.js";
import { ocrRoutes } from "./routes/first-to-market/ocr.js";
import { calendarRoutes } from "./routes/first-to-market/calendar.js";
import { codeRunnerRoutes } from "./routes/first-to-market/code-runner.js";
import { mockServerRoutes } from "./routes/first-to-market/mock-server.js";
import { heartbeatRoutes } from "./routes/kernel/heartbeat.js";
import { auditRoutes } from "./routes/kernel/audit.js";
import { lockRoutes } from "./routes/kernel/lock.js";
import { gateRoutes } from "./routes/kernel/gate.js";
import { quotaRoutes } from "./routes/kernel/quota.js";
import { checkpointRoutes } from "./routes/kernel/checkpoint.js";
import { storeRoutes } from "./routes/kernel/store.js";
import { secretRoutes } from "./routes/kernel/secret.js";
import { queueRoutes } from "./routes/kernel/queue.js";
import { policyRoutes } from "./routes/kernel/policy.js";
import { webhookRoutes } from "./routes/kernel/webhook.js";
import { scheduleRoutes } from "./routes/kernel/schedule.js";
import { diffRoutes } from "./routes/kernel/diff.js";
import { redactRoutes } from "./routes/kernel/redact.js";
import { rankRoutes } from "./routes/kernel/rank.js";
import { dedupeRoutes } from "./routes/kernel/dedupe.js";
import { classifyRoutes } from "./routes/kernel/classify.js";
import { traceRoutes } from "./routes/kernel/trace.js";
import { annotationRoutes } from "./routes/kernel/annotation.js";
import { feedbackRoutes } from "./routes/kernel/feedback.js";
import { convertRoutes } from "./routes/kernel/convert.js";
import { summarizeRoutes } from "./routes/kernel/summarize.js";
import { formRoutes } from "./routes/kernel/form.js";
import { contextRoutes } from "./routes/kernel/context.js";
import { invoiceRoutes } from "./routes/kernel/invoice.js";
import { contractRoutes } from "./routes/kernel/contract.js";
import { expenseRoutes } from "./routes/kernel/expense.js";
import { subscriptionBizRoutes } from "./routes/kernel/subscription-biz.js";
import { ledgerRoutes } from "./routes/kernel/ledger.js";
import { payrollRoutes } from "./routes/kernel/payroll.js";
import { couponRoutes } from "./routes/kernel/coupon.js";
import { cartRoutes } from "./routes/kernel/cart.js";
import { checkoutRoutes } from "./routes/kernel/checkout.js";
import { refundRoutes } from "./routes/kernel/refund.js";
import { inventoryRoutes } from "./routes/kernel/inventory.js";
import { approvalRoutes } from "./routes/kernel/approval.js";
import { docgenRoutes } from "./routes/advanced/docgen.js";
import { handoffRoutes } from "./routes/advanced/handoff.js";
import { escalationRoutes } from "./routes/advanced/escalation.js";
import { disputeRoutes } from "./routes/advanced/dispute.js";
import { entityRoutes } from "./routes/advanced/entity.js";
import { verifyRoutes } from "./routes/advanced/verify.js";
import { watermarkRoutes } from "./routes/advanced/watermark.js";
import { attestRoutes } from "./routes/advanced/attest.js";
import { authMiddleware } from "./middleware/auth.js";
import { usageRateLimitMiddleware } from "./middleware/rate-limit.js";
import { usageTrackingHook } from "./middleware/usage.js";
import { AppError } from "./utils/errors.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === "development" && {
        transport: { target: "pino-pretty" },
      }),
    },
    requestTimeout: 30000,
  });

  // CORS
  await app.register(cors, { origin: true });

  // Multipart (file uploads)
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

  // Swagger
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Agent Utility Belt API",
        description: "41-API suite for AI agent builders",
        version: "0.1.0",
      },
      components: {
        securitySchemes: {
          apiKey: {
            type: "apiKey",
            name: "x-api-key",
            in: "header",
          },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  // Global error handler
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      void reply.code(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
      return;
    }

    // Handle Zod validation errors
    if (error instanceof Error && error.name === "ZodError") {
      void reply.code(400).send({
        success: false,
        error: { code: "VALIDATION_ERROR", message: error.message },
      });
      return;
    }

    app.log.error(error);
    void reply.code(500).send({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    });
  });

  // Public routes
  await app.register(healthRoutes);
  await app.register(urlRedirectRoutes);

  // Protected API routes
  await app.register(async (protectedApp) => {
    protectedApp.addHook("onRequest", authMiddleware);
    protectedApp.addHook("onRequest", usageRateLimitMiddleware);
    protectedApp.addHook("onResponse", usageTrackingHook());

    await protectedApp.register(imageRoutes, { prefix: "/v1/image" });
    await protectedApp.register(pdfRoutes, { prefix: "/v1/pdf" });
    await protectedApp.register(qrRoutes, { prefix: "/v1/qr" });
    await protectedApp.register(emailValidatorRoutes, { prefix: "/v1/email" });
    await protectedApp.register(urlShortenerRoutes, { prefix: "/v1/url" });
    await protectedApp.register(currencyRoutes, { prefix: "/v1/currency" });
    await protectedApp.register(ipGeoRoutes, { prefix: "/v1/ip" });
    await protectedApp.register(stringUtilRoutes, { prefix: "/v1/string" });
    await protectedApp.register(translationRoutes, { prefix: "/v1/translate" });

    // High Demand APIs (Week 2)
    await protectedApp.register(webExtractRoutes, { prefix: "/v1/extract" });
    await protectedApp.register(socialDataRoutes, { prefix: "/v1/social" });
    await protectedApp.register(leadEnrichmentRoutes, { prefix: "/v1/enrich" });
    await protectedApp.register(serpAnalyzerRoutes, { prefix: "/v1/serp" });
    await protectedApp.register(siteMonitorRoutes, { prefix: "/v1/monitor" });
    await protectedApp.register(priceTrackerRoutes, { prefix: "/v1/price" });
    await protectedApp.register(reviewAggregatorRoutes, { prefix: "/v1/reviews" });

    // First-to-Market APIs (Week 3)
    await protectedApp.register(rateOracleRoutes, { prefix: "/v1/rate-oracle" });
    await protectedApp.register(patentSearchRoutes, { prefix: "/v1/patents" });
    await protectedApp.register(paperSearchRoutes, { prefix: "/v1/papers" });
    await protectedApp.register(companyDataRoutes, { prefix: "/v1/company" });
    await protectedApp.register(productScraperRoutes, { prefix: "/v1/product" });
    await protectedApp.register(sentimentRoutes, { prefix: "/v1/sentiment" });
    await protectedApp.register(resumeParserRoutes, { prefix: "/v1/resume" });
    await protectedApp.register(salaryDataRoutes, { prefix: "/v1/salary" });
    await protectedApp.register(taxLookupRoutes, { prefix: "/v1/tax" });
    await protectedApp.register(ocrRoutes, { prefix: "/v1/ocr" });
    await protectedApp.register(calendarRoutes, { prefix: "/v1/calendar" });
    await protectedApp.register(codeRunnerRoutes, { prefix: "/v1/code" });
    await protectedApp.register(mockServerRoutes, { prefix: "/v1/mock" });

    // Agent Kernel APIs (Phase 1)
    await protectedApp.register(heartbeatRoutes, { prefix: "/v1/heartbeat" });
    await protectedApp.register(auditRoutes, { prefix: "/v1/audit" });
    await protectedApp.register(lockRoutes, { prefix: "/v1/lock" });
    await protectedApp.register(gateRoutes, { prefix: "/v1/gate" });
    await protectedApp.register(quotaRoutes, { prefix: "/v1/quota" });
    await protectedApp.register(checkpointRoutes, { prefix: "/v1/checkpoint" });
    await protectedApp.register(storeRoutes, { prefix: "/v1/store" });
    await protectedApp.register(secretRoutes, { prefix: "/v1/secret" });
    await protectedApp.register(queueRoutes, { prefix: "/v1/queue" });
    await protectedApp.register(policyRoutes, { prefix: "/v1/policy" });
    await protectedApp.register(webhookRoutes, { prefix: "/v1/webhook" });
    await protectedApp.register(scheduleRoutes, { prefix: "/v1/schedule" });

    // Agent Utility APIs (Phase 2)
    await protectedApp.register(diffRoutes, { prefix: "/v1/diff" });
    await protectedApp.register(redactRoutes, { prefix: "/v1/redact" });
    await protectedApp.register(rankRoutes, { prefix: "/v1/rank" });
    await protectedApp.register(dedupeRoutes, { prefix: "/v1/dedupe" });
    await protectedApp.register(classifyRoutes, { prefix: "/v1/classify" });
    await protectedApp.register(traceRoutes, { prefix: "/v1/trace" });
    await protectedApp.register(annotationRoutes, { prefix: "/v1/annotation" });
    await protectedApp.register(feedbackRoutes, { prefix: "/v1/feedback" });
    await protectedApp.register(convertRoutes, { prefix: "/v1/convert" });
    await protectedApp.register(summarizeRoutes, { prefix: "/v1/summarize" });
    await protectedApp.register(formRoutes, { prefix: "/v1/form" });
    await protectedApp.register(contextRoutes, { prefix: "/v1/context" });

    // Business Operations APIs (Phase 3)
    await protectedApp.register(invoiceRoutes, { prefix: "/v1/invoice" });
    await protectedApp.register(contractRoutes, { prefix: "/v1/contract" });
    await protectedApp.register(expenseRoutes, { prefix: "/v1/expense" });
    await protectedApp.register(subscriptionBizRoutes, { prefix: "/v1/subscription" });
    await protectedApp.register(ledgerRoutes, { prefix: "/v1/ledger" });
    await protectedApp.register(payrollRoutes, { prefix: "/v1/payroll" });
    await protectedApp.register(couponRoutes, { prefix: "/v1/coupon" });
    await protectedApp.register(cartRoutes, { prefix: "/v1/cart" });
    await protectedApp.register(checkoutRoutes, { prefix: "/v1/checkout" });
    await protectedApp.register(refundRoutes, { prefix: "/v1/refund" });
    await protectedApp.register(inventoryRoutes, { prefix: "/v1/inventory" });
    await protectedApp.register(approvalRoutes, { prefix: "/v1/approval" });

    // Advanced APIs (Phase 4)
    await protectedApp.register(docgenRoutes, { prefix: "/v1/docgen" });
    await protectedApp.register(handoffRoutes, { prefix: "/v1/handoff" });
    await protectedApp.register(escalationRoutes, { prefix: "/v1/escalation" });
    await protectedApp.register(disputeRoutes, { prefix: "/v1/dispute" });
    await protectedApp.register(entityRoutes, { prefix: "/v1/entity" });
    await protectedApp.register(verifyRoutes, { prefix: "/v1/verify" });
    await protectedApp.register(watermarkRoutes, { prefix: "/v1/watermark" });
    await protectedApp.register(attestRoutes, { prefix: "/v1/attest" });
  });

  return app;
}

// Start server if run directly
const isMainModule = process.argv[1]?.includes("index");
if (isMainModule) {
  try {
    const app = await buildApp();
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Server running on http://${env.HOST}:${env.PORT}`);
    app.log.info(`API docs at http://${env.HOST}:${env.PORT}/docs`);
  } catch (err) {
    console.error("Fatal startup error:", err);
    process.exit(1);
  }
}
