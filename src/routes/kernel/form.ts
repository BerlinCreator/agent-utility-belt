import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";

const fieldRuleSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["string", "number", "boolean", "email", "url", "date", "regex"]),
  required: z.boolean().default(true),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  options: z.array(z.string()).optional(),
});

const validateSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  rules: z.array(fieldRuleSchema).min(1).max(200),
});

const generateSchema = z.object({
  fields: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(["text", "number", "email", "url", "date", "select", "checkbox", "textarea", "password"]),
    label: z.string().optional(),
    required: z.boolean().default(false),
    placeholder: z.string().optional(),
    options: z.array(z.string()).optional(),
    defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })).min(1).max(100),
  action: z.string().optional(),
  method: z.enum(["GET", "POST"]).default("POST"),
});

function validateField(
  value: unknown,
  rule: z.infer<typeof fieldRuleSchema>,
): { valid: boolean; error?: string } {
  if (value === undefined || value === null || value === "") {
    return rule.required ? { valid: false, error: `${rule.name} is required` } : { valid: true };
  }

  switch (rule.type) {
    case "string": {
      if (typeof value !== "string") return { valid: false, error: `${rule.name} must be a string` };
      if (rule.min !== undefined && value.length < rule.min) return { valid: false, error: `${rule.name} must be at least ${rule.min} characters` };
      if (rule.max !== undefined && value.length > rule.max) return { valid: false, error: `${rule.name} must be at most ${rule.max} characters` };
      if (rule.options && !rule.options.includes(value)) return { valid: false, error: `${rule.name} must be one of: ${rule.options.join(", ")}` };
      return { valid: true };
    }
    case "number": {
      const num = typeof value === "number" ? value : Number(value);
      if (isNaN(num)) return { valid: false, error: `${rule.name} must be a number` };
      if (rule.min !== undefined && num < rule.min) return { valid: false, error: `${rule.name} must be >= ${rule.min}` };
      if (rule.max !== undefined && num > rule.max) return { valid: false, error: `${rule.name} must be <= ${rule.max}` };
      return { valid: true };
    }
    case "boolean":
      return typeof value === "boolean" ? { valid: true } : { valid: false, error: `${rule.name} must be a boolean` };
    case "email": {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(String(value)) ? { valid: true } : { valid: false, error: `${rule.name} must be a valid email` };
    }
    case "url": {
      try {
        new URL(String(value));
        return { valid: true };
      } catch {
        return { valid: false, error: `${rule.name} must be a valid URL` };
      }
    }
    case "date": {
      const date = new Date(String(value));
      return isNaN(date.getTime()) ? { valid: false, error: `${rule.name} must be a valid date` } : { valid: true };
    }
    case "regex": {
      if (!rule.pattern) return { valid: false, error: `${rule.name} requires a pattern` };
      const regex = new RegExp(rule.pattern);
      return regex.test(String(value)) ? { valid: true } : { valid: false, error: `${rule.name} does not match pattern` };
    }
    default:
      return { valid: true };
  }
}

export async function formRoutes(app: FastifyInstance): Promise<void> {
  app.post("/validate", async (request, reply) => {
    const body = validateSchema.parse(request.body);

    const errors: Array<{ field: string; error: string }> = [];
    const validated: Record<string, unknown> = {};

    for (const rule of body.rules) {
      const value = body.data[rule.name];
      const result = validateField(value, rule);
      if (result.valid) {
        validated[rule.name] = value;
      } else {
        errors.push({ field: rule.name, error: result.error! });
      }
    }

    sendSuccess(reply, {
      valid: errors.length === 0,
      errors,
      validated,
      fieldCount: body.rules.length,
    });
  });

  app.post("/generate", async (request, reply) => {
    const body = generateSchema.parse(request.body);

    const fields = body.fields.map((field) => {
      const attrs: Record<string, string | boolean> = {
        type: field.type === "textarea" || field.type === "select" ? field.type : field.type,
        name: field.name,
        id: field.name,
      };
      if (field.required) attrs["required"] = true;
      if (field.placeholder) attrs["placeholder"] = field.placeholder;
      if (field.defaultValue !== undefined) attrs["value"] = String(field.defaultValue);

      let html: string;
      if (field.type === "textarea") {
        html = `<textarea name="${field.name}" id="${field.name}"${field.required ? " required" : ""}${field.placeholder ? ` placeholder="${field.placeholder}"` : ""}>${field.defaultValue ?? ""}</textarea>`;
      } else if (field.type === "select") {
        const options = (field.options ?? []).map((o) => `  <option value="${o}"${field.defaultValue === o ? " selected" : ""}>${o}</option>`).join("\n");
        html = `<select name="${field.name}" id="${field.name}"${field.required ? " required" : ""}>\n${options}\n</select>`;
      } else {
        const attrStr = Object.entries(attrs).map(([k, v]) => v === true ? k : `${k}="${v}"`).join(" ");
        html = `<input ${attrStr}>`;
      }

      return {
        name: field.name,
        label: field.label ?? field.name,
        html,
      };
    });

    const formHtml = `<form${body.action ? ` action="${body.action}"` : ""} method="${body.method}">\n${fields.map((f) => `  <label for="${f.name}">${f.label}</label>\n  ${f.html}`).join("\n")}\n  <button type="submit">Submit</button>\n</form>`;

    sendSuccess(reply, {
      fields,
      html: formHtml,
    });
  });
}
