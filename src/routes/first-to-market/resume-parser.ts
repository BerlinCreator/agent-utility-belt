import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const textParseSchema = z.object({
  text: z.string().min(10).max(100000),
});

interface Experience {
  title: string;
  company: string;
  duration: string;
}

interface Education {
  school: string;
  degree: string;
  year: string;
}

interface ResumeData {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience: Experience[];
  education: Education[];
}

// Common tech skills for matching
const KNOWN_SKILLS = new Set([
  "javascript", "typescript", "python", "java", "c++", "c#", "go", "golang", "rust",
  "ruby", "php", "swift", "kotlin", "scala", "r", "matlab", "perl",
  "react", "angular", "vue", "svelte", "next.js", "nextjs", "nuxt",
  "node.js", "nodejs", "express", "fastify", "django", "flask", "spring",
  "rails", "laravel", "asp.net", ".net", "graphql", "rest", "grpc",
  "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ansible",
  "jenkins", "github actions", "ci/cd", "linux", "bash", "git",
  "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "dynamodb",
  "sql", "nosql", "cassandra", "sqlite", "oracle",
  "html", "css", "sass", "tailwind", "bootstrap",
  "figma", "sketch", "adobe xd", "photoshop", "illustrator",
  "agile", "scrum", "kanban", "jira", "confluence",
  "machine learning", "deep learning", "nlp", "computer vision",
  "tensorflow", "pytorch", "scikit-learn", "pandas", "numpy",
  "data analysis", "data engineering", "etl", "spark", "hadoop",
  "microservices", "serverless", "event-driven", "api design",
  "security", "oauth", "jwt", "encryption",
  "testing", "unit testing", "e2e testing", "cypress", "selenium",
  "project management", "leadership", "communication",
]);

function extractName(text: string): string | null {
  // First non-empty line that looks like a name (2-4 capitalized words)
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 5)) {
    // Skip lines that look like headers/titles
    if (/^(resume|curriculum|cv|objective|summary|profile|contact)/i.test(line)) continue;
    // Check for name pattern: 2-4 words, mostly capitalized or title case
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Z]/.test(w))) {
      return line;
    }
  }
  return null;
}

function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match?.[0] ?? null;
}

function extractPhone(text: string): string | null {
  const match = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  return match?.[0] ?? null;
}

function extractSkills(text: string): string[] {
  const lowerText = text.toLowerCase();
  const found: string[] = [];

  for (const skill of KNOWN_SKILLS) {
    // Match whole word/phrase
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(lowerText)) {
      found.push(skill);
    }
  }

  return [...new Set(found)].sort();
}

function extractExperience(text: string): Experience[] {
  const experiences: Experience[] = [];
  const lines = text.split("\n").map((l) => l.trim());

  // Look for patterns like: "Title at Company" or "Title - Company" followed by dates
  const titleCompanyPattern = /^(.+?)(?:\s+at\s+|\s*[-–|]\s*)(.+?)$/i;
  const datePattern = /(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{0,4}\s*[-–]\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{0,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}\s*[-–]\s*(?:present|current)|\d{4}\s*[-–]\s*(?:\d{4}|present|current)|\d{1,2}\/\d{4}\s*[-–]\s*(?:\d{1,2}\/\d{4}|present|current))/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = titleCompanyPattern.exec(line);

    if (match) {
      const title = match[1]!.trim();
      const company = match[2]!.trim();

      // Skip if it looks like education
      if (/university|college|school|bachelor|master|phd|degree/i.test(line)) continue;

      // Look for duration in nearby lines
      let duration = "";
      for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 2); j++) {
        const dateMatch = datePattern.exec(lines[j]!);
        if (dateMatch) {
          duration = dateMatch[0];
          break;
        }
      }

      if (title.length > 2 && title.length < 100 && company.length > 1 && company.length < 100) {
        experiences.push({ title, company, duration: duration || "Not specified" });
      }
    }
  }

  return experiences.slice(0, 20);
}

function extractEducation(text: string): Education[] {
  const education: Education[] = [];
  const lines = text.split("\n").map((l) => l.trim());

  const degreePatterns = [
    /(?:bachelor|master|phd|doctorate|associate|mba|bs|ba|ms|ma|bsc|msc|b\.s\.|m\.s\.|b\.a\.|m\.a\.)[^,\n]*/gi,
  ];

  const schoolPatterns = [
    /(?:university|college|institute|school|polytechnic|academy)\s+(?:of\s+)?[A-Za-z\s]+/gi,
  ];

  const yearPattern = /\b(19|20)\d{2}\b/g;

  // Simple approach: find education section and extract entries
  let inEducationSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (/^education/i.test(line)) {
      inEducationSection = true;
      continue;
    }

    if (inEducationSection && /^(experience|work|skills|projects|certif)/i.test(line)) {
      break;
    }

    if (!inEducationSection) continue;

    // Try to extract school and degree from nearby lines
    let degree = "";
    let school = "";
    let year = "";

    for (const pattern of degreePatterns) {
      const match = pattern.exec(line);
      if (match) degree = match[0].trim();
      pattern.lastIndex = 0;
    }

    for (const pattern of schoolPatterns) {
      const match = pattern.exec(line);
      if (match) school = match[0].trim();
      pattern.lastIndex = 0;
    }

    const yearMatches = line.match(yearPattern);
    if (yearMatches) {
      year = yearMatches[yearMatches.length - 1]!;
    }

    if (degree || school) {
      education.push({
        school: school || "Not specified",
        degree: degree || "Not specified",
        year: year || "Not specified",
      });
    }
  }

  return education.slice(0, 10);
}

function parseResume(text: string): ResumeData {
  return {
    name: extractName(text),
    email: extractEmail(text),
    phone: extractPhone(text),
    skills: extractSkills(text),
    experience: extractExperience(text),
    education: extractEducation(text),
  };
}

export async function resumeParserRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/resume/parse (JSON body with text)
  app.post("/parse", async (request, reply) => {
    // Check if it's a file upload or JSON body
    const contentType = request.headers["content-type"] ?? "";

    if (contentType.includes("multipart/form-data")) {
      const file = await request.file();
      if (!file) {
        throw new ValidationError("No file uploaded");
      }

      const buffer = await file.toBuffer();
      const filename = file.filename.toLowerCase();

      let text: string;
      if (filename.endsWith(".txt")) {
        text = buffer.toString("utf-8");
      } else if (filename.endsWith(".pdf")) {
        // Simple PDF text extraction using pdf-lib
        const { PDFDocument } = await import("pdf-lib");
        const pdfDoc = await PDFDocument.load(buffer);
        const pages = pdfDoc.getPages();
        // pdf-lib doesn't extract text well; for production, use pdf-parse
        // For now, return what we can
        text = `PDF with ${pages.length} pages. Use text input for better parsing.`;
      } else {
        text = buffer.toString("utf-8");
      }

      const result = parseResume(text);
      sendSuccess(reply, result);
    } else {
      const { text } = textParseSchema.parse(request.body);
      const result = parseResume(text);
      sendSuccess(reply, result);
    }
  });
}
