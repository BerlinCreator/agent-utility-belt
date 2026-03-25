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
        description: "29-API suite for AI agent builders",
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
  });

  return app;
}

// Start server if run directly
const isMainModule = process.argv[1]?.includes("index");
if (isMainModule) {
  const app = await buildApp();
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Server running on http://${env.HOST}:${env.PORT}`);
    app.log.info(`API docs at http://${env.HOST}:${env.PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
