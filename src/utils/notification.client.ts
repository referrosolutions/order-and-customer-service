import { Injectable, Logger } from '@nestjs/common';

interface SendNotificationDto {
  userId: string;
  id: string;
  title: string;
  message: string;
  link?: string;
  source: string;
}

@Injectable()
export class NotificationClient {
  private readonly logger = new Logger(NotificationClient.name);
  private readonly baseUrl =
    process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:9005';
  private readonly apiKey =
    process.env.NOTIFICATION_SERVICE_API_KEY ?? '';

  async send(dto: SendNotificationDto): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/notifications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
          },
          body: JSON.stringify(dto),
          signal: AbortSignal.timeout(3000),
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `Notification delivery failed for user ${dto.userId}: HTTP ${response.status}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Notification delivery error for user ${dto.userId}: ${(err as Error).message}`,
      );
    }
  }
}
