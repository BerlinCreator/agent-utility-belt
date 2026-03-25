import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

const createSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "DELETE"]),
  responseCode: z.coerce.number().int().min(100).max(599),
  responseBody: z.unknown().optional().default(null),
  delay: z.coerce.number().int().min(0).max(10000).default(0),
  headers: z.record(z.string(), z.string()).optional(),
});

interface MockEndpoint {
  id: string;
  method: string;
  path: string;
  responseCode: number;
  responseBody: unknown;
  delay: number;
  headers: Record<string, string>;
  createdAt: string;
  hitCount: number;
}

// In-memory store for mock endpoints
const mockStore = new Map<string, MockEndpoint>();

// Cleanup old mocks (older than 1 hour)
const MOCK_TTL = 3600000;
function cleanupOldMocks(): void {
  const now = Date.now();
  for (const [id, mock] of mockStore) {
    if (now - new Date(mock.createdAt).getTime() > MOCK_TTL) {
      mockStore.delete(id);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupOldMocks, 600000);

export async function mockServerRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/mock/create — Create a new mock endpoint
  app.post("/create", async (request, reply) => {
    const { method, responseCode, responseBody, delay, headers } = createSchema.parse(request.body);

    // Limit total mocks per instance
    if (mockStore.size >= 1000) {
      cleanupOldMocks();
      if (mockStore.size >= 1000) {
        throw new ValidationError("Maximum mock limit reached (1000). Delete some mocks first.");
      }
    }

    const id = randomBytes(8).toString("hex");
    const mock: MockEndpoint = {
      id,
      method,
      path: `/v1/mock/serve/${id}`,
      responseCode,
      responseBody,
      delay,
      headers: headers ?? {},
      createdAt: new Date().toISOString(),
      hitCount: 0,
    };

    mockStore.set(id, mock);

    sendSuccess(reply, {
      id: mock.id,
      method: mock.method,
      path: mock.path,
      responseCode: mock.responseCode,
      delay: mock.delay,
      createdAt: mock.createdAt,
    }, 201);
  });

  // GET /v1/mock/mocks — List all mocks
  app.get("/mocks", async (_request, reply) => {
    const mocks = Array.from(mockStore.values()).map((m) => ({
      id: m.id,
      method: m.method,
      path: m.path,
      responseCode: m.responseCode,
      delay: m.delay,
      hitCount: m.hitCount,
      createdAt: m.createdAt,
    }));

    sendSuccess(reply, { mocks, total: mocks.length });
  });

  // ALL /v1/mock/serve/:id — Serve or delete the mock response
  app.all("/serve/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    // Handle DELETE — remove mock
    if (request.method === "DELETE") {
      if (!mockStore.has(id)) {
        throw new NotFoundError(`Mock endpoint not found: ${id}`);
      }
      mockStore.delete(id);
      sendSuccess(reply, { deleted: true, id });
      return;
    }

    // Handle serving the mock
    const mock = mockStore.get(id);

    if (!mock) {
      throw new NotFoundError(`Mock endpoint not found: ${id}`);
    }

    // Check method matches
    if (request.method !== mock.method) {
      throw new ValidationError(`Method not allowed. Expected ${mock.method}, got ${request.method}`);
    }

    mock.hitCount++;

    // Apply delay if configured
    if (mock.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, mock.delay));
    }

    // Set custom headers
    for (const [key, value] of Object.entries(mock.headers)) {
      void reply.header(key, value);
    }

    void reply.code(mock.responseCode).send(mock.responseBody);
  });
}
