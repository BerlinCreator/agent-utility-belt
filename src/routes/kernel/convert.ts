import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse as csvParse } from "csv-parse/sync";
import { stringify as csvStringify } from "csv-stringify/sync";
import yaml from "js-yaml";
import { marked } from "marked";
import TurndownService from "turndown";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const transformSchema = z.object({
  input: z.string().min(1).max(500000),
  from: z.enum(["csv", "json", "html", "markdown", "yaml"]),
  to: z.enum(["csv", "json", "html", "markdown", "yaml"]),
});

const VALID_CONVERSIONS = new Set([
  "csv:json", "json:csv",
  "html:markdown", "markdown:html",
  "yaml:json", "json:yaml",
]);

export async function convertRoutes(app: FastifyInstance): Promise<void> {
  app.post("/transform", async (request, reply) => {
    const body = transformSchema.parse(request.body);

    const conversionKey = `${body.from}:${body.to}`;
    if (!VALID_CONVERSIONS.has(conversionKey)) {
      throw new ValidationError(`Unsupported conversion: ${body.from} → ${body.to}. Supported: CSV↔JSON, HTML↔Markdown, YAML↔JSON`);
    }

    let output: string;

    switch (conversionKey) {
      case "csv:json": {
        const records = csvParse(body.input, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
        output = JSON.stringify(records, null, 2);
        break;
      }
      case "json:csv": {
        const data = JSON.parse(body.input) as Record<string, unknown>[];
        if (!Array.isArray(data)) throw new ValidationError("JSON input must be an array of objects for CSV conversion");
        output = csvStringify(data, { header: true });
        break;
      }
      case "html:markdown": {
        const turndown = new TurndownService();
        output = turndown.turndown(body.input);
        break;
      }
      case "markdown:html": {
        output = await marked(body.input);
        break;
      }
      case "yaml:json": {
        const parsed = yaml.load(body.input);
        output = JSON.stringify(parsed, null, 2);
        break;
      }
      case "json:yaml": {
        const parsed = JSON.parse(body.input) as unknown;
        output = yaml.dump(parsed);
        break;
      }
      default:
        throw new ValidationError(`Unsupported conversion: ${conversionKey}`);
    }

    sendSuccess(reply, {
      output,
      from: body.from,
      to: body.to,
      inputLength: body.input.length,
      outputLength: output.length,
    });
  });
}
