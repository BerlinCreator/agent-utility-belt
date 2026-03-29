import type { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { sendSuccess } from "../../utils/response.js";

const signSchema = z.object({
  data: z.string().min(1).max(100000),
  key: z.string().min(1).max(1000),
  algorithm: z.enum(["sha256", "sha384", "sha512"]).default("sha256"),
});

const verifySchema = z.object({
  data: z.string().min(1).max(100000),
  signature: z.string().min(1),
  key: z.string().min(1).max(1000),
  algorithm: z.enum(["sha256", "sha384", "sha512"]).default("sha256"),
});

export async function attestRoutes(app: FastifyInstance): Promise<void> {
  // POST /sign — create HMAC signature
  app.post("/sign", async (request, reply) => {
    const body = signSchema.parse(request.body);

    const hmac = crypto.createHmac(body.algorithm, body.key);
    hmac.update(body.data);
    const signature = hmac.digest("hex");

    sendSuccess(reply, {
      signature,
      algorithm: `hmac-${body.algorithm}`,
      dataLength: body.data.length,
      timestamp: new Date().toISOString(),
    });
  });

  // POST /verify — verify HMAC signature
  app.post("/verify", async (request, reply) => {
    const body = verifySchema.parse(request.body);

    const hmac = crypto.createHmac(body.algorithm, body.key);
    hmac.update(body.data);
    const expected = hmac.digest("hex");

    const valid = crypto.timingSafeEqual(
      Buffer.from(body.signature, "hex"),
      Buffer.from(expected, "hex"),
    );

    sendSuccess(reply, {
      valid,
      algorithm: `hmac-${body.algorithm}`,
      timestamp: new Date().toISOString(),
    });
  });
}
