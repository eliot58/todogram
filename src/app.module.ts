import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { SentryModule } from '@sentry/nestjs/setup';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { PostsModule } from './posts/posts.module';
import { StoriesModule } from './stories/stories.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { ChatModule } from './chat/chat.module';
import { UsersRouterModule } from './users/users.router.module';
import appConfig from './config/app.config';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig]
    }),
    // LoggerModule.forRoot(),
    MailerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (appCfg: ConfigType<typeof appConfig>) => {
        return {
          transport: {
            host: 'smtp.mail.ru',
            port: 587,
            secure: false,
            auth: {
              user: appCfg.email_host_user,
              pass: appCfg.email_host_password,
            }
          },
        };
      }
    }),
    AuthModule,
    UsersRouterModule,
    PostsModule,
    StoriesModule,
    ChatModule
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
