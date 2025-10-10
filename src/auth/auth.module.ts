import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import appConfig from '../config/app.config';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [appConfig.KEY],
      global: true,
      useFactory: (appCfg: ConfigType<typeof appConfig>) => ({
        secret: appCfg.jwt_secret,
      }),
    }),
    PrismaModule,
    RedisModule
  ],
  providers: [AuthService],
  controllers: [AuthController]
})
export class AuthModule { }
