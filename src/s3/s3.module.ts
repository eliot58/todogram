import { Module } from '@nestjs/common';
import { S3Service } from './s3.service';
import { S3Client } from '@aws-sdk/client-s3';
import { ConfigType } from '@nestjs/config';
import appConfig from '../config/app.config';

@Module({
  providers: [
    {
      provide: 'S3_CLIENT',
      inject: [appConfig.KEY],
      useFactory: (appCfg: ConfigType<typeof appConfig>) => {
        const base: any = {
          region: appCfg.aws_region,
          credentials: {
            accessKeyId: appCfg.aws_access_key_id,
            secretAccessKey: appCfg.aws_secret_access_key,
          },
        };

        return new S3Client(base);
      },
    },
    S3Service
  ],
  exports: ['S3_CLIENT', S3Service]
})
export class S3Module {}
