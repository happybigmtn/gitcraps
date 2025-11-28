/**
 * Admin API Authentication Helper
 *
 * Validates Bearer token authentication for admin endpoints.
 * Expects Authorization header with format: "Bearer <token>"
 * Token is validated against ADMIN_API_TOKEN environment variable.
 */

import { NextResponse } from "next/server";

export interface AuthResult {
  authorized: boolean;
  response?: NextResponse;
}

/**
 * Validates admin API token from Authorization header
 *
 * @param request - The incoming request object
 * @returns AuthResult with authorized flag and optional error response
 */
export function validateAdminToken(request: Request): AuthResult {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "Missing Authorization header" },
        { status: 401 }
      ),
    };
  }

  if (!authHeader.startsWith("Bearer ")) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "Invalid Authorization format. Expected: Bearer <token>" },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix
  const adminToken = process.env.ADMIN_API_TOKEN;

  if (!adminToken) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "Server configuration error: ADMIN_API_TOKEN not set" },
        { status: 500 }
      ),
    };
  }

  if (token !== adminToken) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "Invalid admin token" },
        { status: 401 }
      ),
    };
  }

  return { authorized: true };
}
