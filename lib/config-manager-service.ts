"use client";

import type {
  ApiError,
  CreateStagedLoanBookRequest,
  ProfileResponse,
  StagedLoanBookResponse,
  UpdateStagedLoanBookRequest,
} from "./types/config-manager";

/**
 * Custom error class for Config Manager API errors
 */
export class ConfigManagerError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "ConfigManagerError";
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, ConfigManagerError.prototype);
  }
}

/**
 * Configuration for the Config Manager service
 */
interface ConfigManagerConfig {
  baseUrl: string;
  bearerToken?: string;
}

/**
 * HTTP request options
 */
interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  bearerToken?: string;
  queryParams?: Record<string, string | boolean | number | undefined>;
}

/**
 * Delay utility for retry logic
 */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Config Manager Service - Complete API client for config-manager API
 *
 * Provides methods to interact with staged loan books and profiles.
 * Includes automatic retry logic and comprehensive error handling.
 */
export class ConfigManagerService {
  private readonly config: ConfigManagerConfig;
  private readonly maxRetries = 3;
  private readonly initialRetryDelay = 1000; // 1 second

  /**
   * Creates a new ConfigManagerService instance
   *
   * @param bearerToken - Optional bearer token for authenticated endpoints
   */
  constructor(bearerToken?: string) {
    const baseUrl =
      process.env.NEXT_PUBLIC_CONFIG_MANAGER_API_URL ||
      "http://localhost:8080/api/v1";

    this.config = {
      baseUrl,
      bearerToken,
    };
  }

  /**
   * Makes an HTTP request with retry logic and error handling
   *
   * @param options - Request configuration options
   * @returns Parsed JSON response or void for DELETE requests
   * @throws ConfigManagerError on request failure
   */
  private async request<T>(options: RequestOptions): Promise<T> {
    const { method, path, body, bearerToken, queryParams } = options;

    // Build URL with query parameters
    let url = `${this.config.baseUrl}${path}`;
    if (queryParams) {
      const params = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    // Prepare headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add authorization header if bearer token is provided
    const token = bearerToken || this.config.bearerToken;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    let lastError: Error | null = null;

    // Retry logic with exponential backoff
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        // Handle successful responses
        if (response.ok) {
          // DELETE requests typically return no content
          if (method === "DELETE") {
            return undefined as T;
          }

          // Parse JSON response
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            return (await response.json()) as T;
          }

          // Return void for non-JSON responses
          return undefined as T;
        }

        // Handle error responses
        let errorData: ApiError | null = null;
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            errorData = (await response.json()) as ApiError;
          }
        } catch {
          // Ignore JSON parsing errors for error responses
        }

        const errorMessage =
          errorData?.message || response.statusText || "Unknown error";
        const errorDetails = errorData?.details;

        throw new ConfigManagerError(
          errorMessage,
          response.status,
          errorDetails
        );
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx) except for specific cases
        if (
          error instanceof ConfigManagerError &&
          error.statusCode >= 400 &&
          error.statusCode < 500 &&
          error.statusCode !== 429 // Retry on rate limit
        ) {
          throw error;
        }

        // Don't retry on the last attempt
        if (attempt === this.maxRetries - 1) {
          break;
        }

        // Exponential backoff delay
        const delayMs = this.initialRetryDelay * Math.pow(2, attempt);
        await delay(delayMs);
      }
    }

    // If all retries failed, throw the last error
    if (lastError instanceof ConfigManagerError) {
      throw lastError;
    }

    throw new ConfigManagerError(
      lastError?.message || "Request failed after retries",
      500,
      lastError
    );
  }

  /**
   * Lists all staged loan books
   *
   * @param incompleteOnly - If true, only return staged loan books where is_complete is false
   * @returns Array of staged loan book responses
   */
  async listStagedLoanBooks(
    incompleteOnly?: boolean
  ): Promise<StagedLoanBookResponse[]> {
    return this.request<StagedLoanBookResponse[]>({
      method: "GET",
      path: "/admin/staged-loan-books",
      queryParams: incompleteOnly !== undefined ? { incompleteOnly } : undefined,
    });
  }

  /**
   * Gets a specific staged loan book by address
   *
   * @param address - Blockchain address of the loan book
   * @returns Staged loan book response
   */
  async getStagedLoanBook(address: string): Promise<StagedLoanBookResponse> {
    return this.request<StagedLoanBookResponse>({
      method: "GET",
      path: `/admin/staged-loan-books/${encodeURIComponent(address)}`,
    });
  }

  /**
   * Creates a new staged loan book
   *
   * @param data - Staged loan book creation data
   * @returns Created staged loan book response
   */
  async createStagedLoanBook(
    data: CreateStagedLoanBookRequest
  ): Promise<StagedLoanBookResponse> {
    return this.request<StagedLoanBookResponse>({
      method: "POST",
      path: "/admin/staged-loan-books",
      body: data,
    });
  }

  /**
   * Updates an existing staged loan book
   *
   * @param address - Blockchain address of the loan book
   * @param data - Partial update data for the staged loan book
   * @returns Updated staged loan book response
   */
  async updateStagedLoanBook(
    address: string,
    data: UpdateStagedLoanBookRequest
  ): Promise<StagedLoanBookResponse> {
    return this.request<StagedLoanBookResponse>({
      method: "PATCH",
      path: `/admin/staged-loan-books/${encodeURIComponent(address)}`,
      body: data,
    });
  }

  /**
   * Deletes a staged loan book
   *
   * @param address - Blockchain address of the loan book
   */
  async deleteStagedLoanBook(address: string): Promise<void> {
    return this.request<void>({
      method: "DELETE",
      path: `/admin/staged-loan-books/${encodeURIComponent(address)}`,
    });
  }

  /**
   * Promotes a staged loan book to production
   *
   * This operation marks the staged loan book as promoted and makes it available in production.
   * The staged loan book must be complete (is_complete: true) before it can be promoted.
   *
   * @param address - Blockchain address of the loan book to promote
   */
  async promoteStagedLoanBook(address: string): Promise<void> {
    return this.request<void>({
      method: "POST",
      path: `/admin/staged-loan-books/${encodeURIComponent(address)}/promote`,
      body: {},
    });
  }

  /**
   * Gets a profile by profile slug
   *
   * This endpoint requires authentication via bearer token.
   *
   * @param profileSlug - URL-friendly profile identifier
   * @param bearerToken - Bearer token for authentication
   * @returns Profile response with associated loan books
   */
  async getProfile(
    profileSlug: string,
    bearerToken: string
  ): Promise<ProfileResponse> {
    return this.request<ProfileResponse>({
      method: "GET",
      path: `/v0/profiles/${encodeURIComponent(profileSlug)}`,
      bearerToken,
    });
  }
}

/**
 * Creates a new ConfigManagerService instance
 *
 * @param bearerToken - Optional bearer token for authenticated endpoints
 * @returns ConfigManagerService instance
 */
export function createConfigManagerService(
  bearerToken?: string
): ConfigManagerService {
  return new ConfigManagerService(bearerToken);
}
