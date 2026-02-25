import {
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

export function handleServiceError(
  error: unknown,
  defaultMessage: string,
  context?: string,
): never {
  if (error instanceof HttpException) {
    throw error;
  }
  const logger = new Logger(context || 'GlobalErrorHandler');
  if (error instanceof Error) {
    logger.error(
      `Error occurred: ${defaultMessage} -> ${error.message}`,
      error.stack,
    );
  } else {
    logger.error(`Error occurred: ${defaultMessage}`, JSON.stringify(error));
  }

  throw new InternalServerErrorException(defaultMessage);
}
