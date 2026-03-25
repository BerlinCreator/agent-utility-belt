import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.js";
import { ValidationError } from "../../utils/errors.js";

const checkSchema = z.object({
  timezone: z.string().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
  duration: z.coerce.number().int().min(15).max(480),
  workingHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM format"),
    end: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM format"),
  }).default({ start: "09:00", end: "17:00" }),
});

interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const parts = timeStr.split(":");
  return {
    hours: parseInt(parts[0]!, 10),
    minutes: parseInt(parts[1]!, 10),
  };
}

function formatTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function generateSlots(
  date: string,
  duration: number,
  workStart: string,
  workEnd: string,
  timezone: string,
): TimeSlot[] {
  const start = parseTime(workStart);
  const end = parseTime(workEnd);

  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;

  if (startMinutes >= endMinutes) {
    throw new ValidationError("Working hours start must be before end");
  }

  const slots: TimeSlot[] = [];
  let current = startMinutes;

  while (current + duration <= endMinutes) {
    const slotStartHours = Math.floor(current / 60);
    const slotStartMinutes = current % 60;
    const slotEndMinutes = current + duration;
    const slotEndHours = Math.floor(slotEndMinutes / 60);
    const slotEndMins = slotEndMinutes % 60;

    slots.push({
      start: `${date}T${formatTime(slotStartHours, slotStartMinutes)}:00`,
      end: `${date}T${formatTime(slotEndHours, slotEndMins)}:00`,
      available: true, // All slots available by default (no calendar integration)
    });

    // Move to next slot (increment by duration for non-overlapping slots)
    current += duration;
  }

  // Add timezone info to slot times
  return slots.map((slot) => ({
    ...slot,
    start: `${slot.start} ${timezone}`,
    end: `${slot.end} ${timezone}`,
  }));
}

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/calendar/check
  app.post("/check", async (request, reply) => {
    const { timezone, date, duration, workingHours } = checkSchema.parse(request.body);

    // Validate timezone exists
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      throw new ValidationError(`Invalid timezone: ${timezone}`);
    }

    // Validate date is valid
    const dateObj = new Date(`${date}T00:00:00`);
    if (isNaN(dateObj.getTime())) {
      throw new ValidationError(`Invalid date: ${date}`);
    }

    const slots = generateSlots(date, duration, workingHours.start, workingHours.end, timezone);

    sendSuccess(reply, {
      date,
      timezone,
      slots,
      workingHours,
      slotDuration: duration,
      totalSlots: slots.length,
    });
  });
}
