import * as Sentry from '@sentry/nestjs';
import { ConfigService } from '@nestjs/config';

const configService = new ConfigService();

Sentry.init({
  dsn: configService.get<string>('SENTRY_DSN'),
  sendDefaultPii: true
});