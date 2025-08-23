import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SentryModule } from '@sentry/nestjs/setup';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PostsModule } from './posts/posts.module';
import { StoriesModule } from './stories/stories.module';
import { PrismaModule } from './prisma/prisma.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { RedisModule } from './redis/redis.module';
import { S3Module } from './s3/s3.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true
    }),
    // LoggerModule.forRoot(),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const user = config.get<string>('EMAIL_HOST_USER');
        const pass = config.get<string>('EMAIL_HOST_PASSWORD');

        return {
          transport: {
            host: 'smtp.mail.ru',
            port: 587,
            secure: false,
            auth: {
              user,
              pass,
            }
          },
        };
      }
    }),
    AuthModule,
    UsersModule,
    PostsModule,
    StoriesModule,
    PrismaModule,
    RedisModule,
    S3Module,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule {}
