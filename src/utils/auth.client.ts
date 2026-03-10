import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AuthClient {
  private readonly logger = new Logger(AuthClient.name);
  private readonly baseUrl =
    process.env.AUTH_SERVICE_URL ?? 'http://localhost:9000';
  private readonly serviceSecret =
    process.env.INTERNAL_SERVICE_SECRET ?? '';

  async getVendorNames(userIds: string[]): Promise<Record<string, string>> {
    if (userIds.length === 0) return {};
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/auth/internal/vendor-names`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-service-secret': this.serviceSecret,
          },
          body: JSON.stringify({ ids: userIds }),
          signal: AbortSignal.timeout(3000),
        },
      );
      if (response.ok) {
        return (await response.json()) as Record<string, string>;
      }
      this.logger.warn(
        `Auth-service vendor-names returned HTTP ${response.status}`,
      );
    } catch (err) {
      this.logger.warn(
        `Auth-service vendor-names unavailable: ${(err as Error).message}`,
      );
    }
    return {};
  }

  async getCreatorNames(userIds: string[]): Promise<Record<string, string>> {
    if (userIds.length === 0) return {};
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/auth/internal/creator-names`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-service-secret': this.serviceSecret,
          },
          body: JSON.stringify({ ids: userIds }),
          signal: AbortSignal.timeout(3000),
        },
      );
      if (response.ok) {
        return (await response.json()) as Record<string, string>;
      }
      this.logger.warn(
        `Auth-service creator-names returned HTTP ${response.status}`,
      );
    } catch (err) {
      this.logger.warn(
        `Auth-service creator-names unavailable: ${(err as Error).message}`,
      );
    }
    return {};
  }
}
