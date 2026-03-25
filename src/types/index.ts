export type Tier = "free" | "starter" | "growth" | "business" | "enterprise";

export interface ApiKey {
  id: string;
  userId: string;
  key: string;
  tier: Tier;
  isActive: boolean;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface UsageLog {
  id: string;
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  requestBody: unknown;
  createdAt: Date;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    requestId: string;
    responseTimeMs: number;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
