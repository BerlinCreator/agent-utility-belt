import type { FastifyReply } from "fastify";
import type { ApiResponse } from "../types/index.js";

export function sendSuccess<T>(reply: FastifyReply, data: T, statusCode = 200): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };
  void reply.code(statusCode).send(response);
}

export function sendError(reply: FastifyReply, statusCode: number, code: string, message: string): void {
  const response: ApiResponse = {
    success: false,
    error: { code, message },
  };
  void reply.code(statusCode).send(response);
}
