import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { sendSuccess } from "../../utils/response.js";

const encodeSchema = z.object({
  input: z.string().max(100000),
  encoding: z.enum(["base64", "url", "html", "hex"]),
});

const hashSchema = z.object({
  input: z.string().max(100000),
  algorithm: z.enum(["md5", "sha1", "sha256", "sha512"]).default("sha256"),
});

const slugifySchema = z.object({
  input: z.string().min(1).max(1000),
  separator: z.string().max(3).default("-"),
  lowercase: z.boolean().default(true),
});

const truncateSchema = z.object({
  input: z.string().min(1),
  length: z.coerce.number().int().min(1).max(100000),
  suffix: z.string().max(20).default("..."),
});

const generateSchema = z.object({
  length: z.coerce.number().int().min(1).max(1000).default(32),
  charset: z.enum(["alphanumeric", "alpha", "numeric", "hex", "base64"]).default("alphanumeric"),
});

const caseSchema = z.object({
  input: z.string().min(1).max(10000),
  to: z.enum(["camel", "snake", "kebab", "pascal", "constant", "title"]),
});

export async function stringUtilRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/string/encode
  app.post("/encode", async (request, reply) => {
    const { input, encoding } = encodeSchema.parse(request.body);
    sendSuccess(reply, { encoded: encode(input, encoding), encoding });
  });

  // POST /v1/string/decode
  app.post("/decode", async (request, reply) => {
    const { input, encoding } = encodeSchema.parse(request.body);
    sendSuccess(reply, { decoded: decode(input, encoding), encoding });
  });

  // POST /v1/string/hash
  app.post("/hash", async (request, reply) => {
    const { input, algorithm } = hashSchema.parse(request.body);
    const hash = createHash(algorithm).update(input).digest("hex");
    sendSuccess(reply, { hash, algorithm, length: hash.length });
  });

  // POST /v1/string/slugify
  app.post("/slugify", async (request, reply) => {
    const { input, separator, lowercase } = slugifySchema.parse(request.body);
    const slug = slugify(input, separator, lowercase);
    sendSuccess(reply, { slug, original: input });
  });

  // POST /v1/string/truncate
  app.post("/truncate", async (request, reply) => {
    const { input, length, suffix } = truncateSchema.parse(request.body);
    const truncated = input.length > length
      ? input.substring(0, length - suffix.length) + suffix
      : input;
    sendSuccess(reply, { truncated, originalLength: input.length, truncatedLength: truncated.length });
  });

  // POST /v1/string/generate
  app.post("/generate", async (request, reply) => {
    const { length, charset } = generateSchema.parse(request.body);
    const result = generateRandom(length, charset);
    sendSuccess(reply, { generated: result, length: result.length, charset });
  });

  // POST /v1/string/case
  app.post("/case", async (request, reply) => {
    const { input, to } = caseSchema.parse(request.body);
    const converted = convertCase(input, to);
    sendSuccess(reply, { converted, from: input, case: to });
  });
}

function encode(input: string, encoding: string): string {
  switch (encoding) {
    case "base64": return Buffer.from(input).toString("base64");
    case "url": return encodeURIComponent(input);
    case "html": return input.replace(/[&<>"']/g, (c) => {
      const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return map[c] ?? c;
    });
    case "hex": return Buffer.from(input).toString("hex");
    default: return input;
  }
}

function decode(input: string, encoding: string): string {
  switch (encoding) {
    case "base64": return Buffer.from(input, "base64").toString("utf-8");
    case "url": return decodeURIComponent(input);
    case "html": return input
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    case "hex": return Buffer.from(input, "hex").toString("utf-8");
    default: return input;
  }
}

function slugify(input: string, separator: string, lowercase: boolean): string {
  let slug = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, separator)
    .replace(new RegExp(`${escapeRegex(separator)}+`, "g"), separator);

  if (lowercase) slug = slug.toLowerCase();
  return slug;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function generateRandom(length: number, charset: string): string {
  const charsets: Record<string, string> = {
    alphanumeric: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    alpha: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    numeric: "0123456789",
    hex: "0123456789abcdef",
    base64: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
  };

  const chars = charsets[charset] ?? charsets["alphanumeric"]!;
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i]! % chars.length];
  }
  return result;
}

function convertCase(input: string, to: string): string {
  // Split on word boundaries
  const words = input
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .trim()
    .split(/\s+/);

  switch (to) {
    case "camel":
      return words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
    case "pascal":
      return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
    case "snake":
      return words.map(w => w.toLowerCase()).join("_");
    case "kebab":
      return words.map(w => w.toLowerCase()).join("-");
    case "constant":
      return words.map(w => w.toUpperCase()).join("_");
    case "title":
      return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    default:
      return input;
  }
}
