import type { FastifyInstance } from "fastify";
import { z } from "zod";
import vm from "node:vm";
import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const executeSchema = z.object({
  language: z.enum(["javascript", "python"]),
  code: z.string().min(1).max(10000),
  timeout: z.coerce.number().int().min(100).max(10000).default(5000),
});

// Dangerous patterns to block
const BLOCKED_JS_PATTERNS = [
  /require\s*\(/,
  /import\s*\(/,
  /process\./,
  /child_process/,
  /fs\./,
  /net\./,
  /http\./,
  /https\./,
  /dgram\./,
  /cluster\./,
  /worker_threads/,
  /\beval\s*\(/,
  /Function\s*\(/,
  /globalThis/,
  /global\./,
];

const BLOCKED_PYTHON_PATTERNS = [
  /\bimport\s+os\b/,
  /\bimport\s+sys\b/,
  /\bimport\s+subprocess\b/,
  /\bimport\s+shutil\b/,
  /\bimport\s+socket\b/,
  /\bimport\s+http\b/,
  /\bimport\s+urllib\b/,
  /\bimport\s+requests\b/,
  /\bfrom\s+os\b/,
  /\bfrom\s+sys\b/,
  /\bfrom\s+subprocess\b/,
  /\bopen\s*\(/,
  /\bexec\s*\(/,
  /\b__import__\s*\(/,
  /\beval\s*\(/,
  /\bcompile\s*\(/,
];

function validateCode(code: string, language: string): void {
  const patterns = language === "javascript" ? BLOCKED_JS_PATTERNS : BLOCKED_PYTHON_PATTERNS;

  for (const pattern of patterns) {
    if (pattern.test(code)) {
      throw new ValidationError(`Blocked: code contains disallowed pattern (${pattern.source}). Sandboxed execution prohibits network, filesystem, and process access.`);
    }
  }
}

interface ExecutionResult {
  output: string;
  error: string | null;
  executionTime: number;
  language: string;
}

async function executeJavaScript(code: string, timeout: number): Promise<ExecutionResult> {
  const start = performance.now();

  // Create a sandboxed context with limited globals
  const logs: string[] = [];
  const sandbox = {
    console: {
      log: (...args: unknown[]) => { logs.push(args.map(String).join(" ")); },
      error: (...args: unknown[]) => { logs.push(`[error] ${args.map(String).join(" ")}`); },
      warn: (...args: unknown[]) => { logs.push(`[warn] ${args.map(String).join(" ")}`); },
    },
    Math,
    Date,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    RegExp,
    Error,
    TypeError,
    RangeError,
    Promise,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    fetch: undefined,
    require: undefined,
    module: undefined,
    exports: undefined,
    process: undefined,
    global: undefined,
    globalThis: undefined,
  };

  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });

  try {
    const script = new vm.Script(code);
    const result = script.runInContext(context, { timeout });

    if (result !== undefined) {
      logs.push(String(result));
    }

    const executionTime = Math.round(performance.now() - start);
    return { output: logs.join("\n"), error: null, executionTime, language: "javascript" };
  } catch (err) {
    const executionTime = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : "Execution failed";
    return { output: logs.join("\n"), error: message, executionTime, language: "javascript" };
  }
}

async function executePython(code: string, timeout: number): Promise<ExecutionResult> {
  const start = performance.now();

  // Write code to temp file
  const tmpFile = join(tmpdir(), `sandbox_${randomBytes(8).toString("hex")}.py`);

  try {
    await writeFile(tmpFile, code, "utf-8");

    return await new Promise<ExecutionResult>((resolve) => {
      const child = execFile(
        "python3",
        [tmpFile],
        {
          timeout,
          maxBuffer: 1024 * 1024, // 1MB output limit
          env: { PATH: "/usr/bin:/usr/local/bin" }, // Minimal env
        },
        (error, stdout, stderr) => {
          const executionTime = Math.round(performance.now() - start);

          if (error) {
            resolve({
              output: stdout,
              error: stderr || error.message,
              executionTime,
              language: "python",
            });
          } else {
            resolve({
              output: stdout,
              error: stderr || null,
              executionTime,
              language: "python",
            });
          }
        },
      );

      // Kill if it takes too long
      setTimeout(() => {
        child.kill("SIGKILL");
      }, timeout + 1000);
    });
  } finally {
    // Clean up temp file
    await unlink(tmpFile).catch(() => {});
  }
}

export async function codeRunnerRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/code/execute
  app.post("/execute", async (request, reply) => {
    const { language, code, timeout } = executeSchema.parse(request.body);

    // Security check
    validateCode(code, language);

    let result: ExecutionResult;
    if (language === "javascript") {
      result = await executeJavaScript(code, timeout);
    } else {
      result = await executePython(code, timeout);
    }

    sendSuccess(reply, result);
  });
}
