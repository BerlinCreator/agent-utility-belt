import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { db } from "../../db/connection.js";
import { secrets } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, AppError } from "../../utils/errors.js";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, "hex");
}

function encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return { ciphertext: encrypted, iv: iv.toString("hex"), authTag };
}

function decrypt(ciphertext: string, ivHex: string, authTagHex: string): string {
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function maskValue(value: string): string {
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
  value: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const rotateSchema = z.object({
  value: z.string().min(1),
});

export async function secretRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/secret/create
  app.post("/create", async (request, reply) => {
    const body = createSchema.parse(request.body);
    const { ciphertext, iv, authTag } = encrypt(body.value);

    const [created] = await db
      .insert(secrets)
      .values({
        name: body.name,
        ciphertext,
        iv,
        authTag,
        metadata: body.metadata,
      })
      .returning({
        id: secrets.id,
        name: secrets.name,
        version: secrets.version,
        createdAt: secrets.createdAt,
      });

    sendSuccess(reply, { ...created, masked: maskValue(body.value) }, 201);
  });

  // GET /v1/secret/:id — returns masked value
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db
      .select()
      .from(secrets)
      .where(eq(secrets.id, id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError(`Secret '${id}' not found`);

    const secret = rows[0]!;
    let masked: string;
    try {
      const plaintext = decrypt(secret.ciphertext, secret.iv, secret.authTag);
      masked = maskValue(plaintext);
    } catch {
      throw new AppError(500, "DECRYPTION_ERROR", "Failed to decrypt secret");
    }

    sendSuccess(reply, {
      id: secret.id,
      name: secret.name,
      masked,
      version: secret.version,
      metadata: secret.metadata,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    });
  });

  // POST /v1/secret/rotate/:id — rotate a secret's value
  app.post("/rotate/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = rotateSchema.parse(request.body);
    const { ciphertext, iv, authTag } = encrypt(body.value);

    const [updated] = await db
      .update(secrets)
      .set({
        ciphertext,
        iv,
        authTag,
        version: sql`${secrets.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(secrets.id, id))
      .returning({
        id: secrets.id,
        name: secrets.name,
        version: secrets.version,
        updatedAt: secrets.updatedAt,
      });

    if (!updated) throw new NotFoundError(`Secret '${id}' not found`);

    sendSuccess(reply, { ...updated, masked: maskValue(body.value) });
  });

  // DELETE /v1/secret/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const [deleted] = await db.delete(secrets).where(eq(secrets.id, id)).returning();
    if (!deleted) throw new NotFoundError(`Secret '${id}' not found`);

    sendSuccess(reply, { deleted: true, id });
  });
}
