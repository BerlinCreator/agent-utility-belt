import type { FastifyInstance } from "fastify";
import { sendSuccess } from "../utils/response.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    sendSuccess(reply, {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      uptime: process.uptime(),
    });
  });
}
