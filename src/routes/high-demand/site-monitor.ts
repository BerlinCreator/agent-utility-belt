import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TLSSocket } from "node:tls";
import { connect } from "node:tls";
import { URL } from "node:url";
import { sendSuccess } from "../../utils/response.js";
import { AppError } from "../../utils/errors.js";

const checkSchema = z.object({
  url: z.string().url(),
  timeout: z.coerce.number().int().min(1000).max(30000).default(10000),
});

interface SslInfo {
  valid: boolean;
  expiresAt: string | null;
  issuer: string | null;
  subject: string | null;
  daysUntilExpiry: number | null;
}

async function checkSsl(hostname: string): Promise<SslInfo> {
  return new Promise((resolve) => {
    const socket = connect(
      { host: hostname, port: 443, servername: hostname, timeout: 5000 },
      () => {
        const cert = (socket as TLSSocket).getPeerCertificate();
        const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
        const now = new Date();
        const daysUntilExpiry = validTo
          ? Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        resolve({
          valid: (socket as TLSSocket).authorized,
          expiresAt: validTo?.toISOString() ?? null,
          issuer: cert.issuer ? Object.values(cert.issuer).join(", ") : null,
          subject: cert.subject?.CN ? (Array.isArray(cert.subject.CN) ? cert.subject.CN[0] ?? null : cert.subject.CN) : null,
          daysUntilExpiry,
        });

        socket.destroy();
      },
    );

    socket.on("error", () => {
      resolve({
        valid: false,
        expiresAt: null,
        issuer: null,
        subject: null,
        daysUntilExpiry: null,
      });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({
        valid: false,
        expiresAt: null,
        issuer: null,
        subject: null,
        daysUntilExpiry: null,
      });
    });
  });
}

export async function siteMonitorRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/monitor/check
  app.post("/check", async (request, reply) => {
    const params = checkSchema.parse(request.body);

    const startTime = Date.now();
    let statusCode: number | null = null;
    let status: "up" | "down" | "error" = "error";
    let responseHeaders: Record<string, string> = {};

    try {
      const response = await fetch(params.url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(params.timeout),
        headers: {
          "User-Agent": "AgentUtilityBelt-Monitor/1.0",
        },
      });

      statusCode = response.status;
      status = response.ok ? "up" : "down";

      const headersObj: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headersObj[key] = value;
      });
      responseHeaders = headersObj;
    } catch (error) {
      status = "down";
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new AppError(504, "TIMEOUT", `URL did not respond within ${params.timeout.toString()}ms`);
      }
    }

    const responseTimeMs = Date.now() - startTime;

    // Check SSL for HTTPS URLs
    const parsedUrl = new URL(params.url);
    let ssl: SslInfo | null = null;
    if (parsedUrl.protocol === "https:") {
      ssl = await checkSsl(parsedUrl.hostname);
    }

    sendSuccess(reply, {
      url: params.url,
      status,
      statusCode,
      responseTimeMs,
      ssl,
      headers: responseHeaders,
      checkedAt: new Date().toISOString(),
    });
  });
}
