import type { Request } from 'express';

export function extractTokenFromRequest(request: Request): string | undefined {
  // 1. Check Authorization header first (for SDK/API clients)
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // 2. Fallback to cookie (for web app)
  if (request.cookies && request.cookies.accessToken) {
    const accessToken = request.cookies.accessToken as string;
    if (accessToken.startsWith('Bearer ')) {
      return accessToken.split(' ')[1];
    }
    return accessToken;
  }

  return undefined;
}
