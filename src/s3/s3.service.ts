import { Inject, Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuid } from 'uuid';
import { ConfigType } from '@nestjs/config';
import appConfig from '../config/app.config';

@Injectable()
export class S3Service {
    constructor(
        @Inject('S3_CLIENT') private readonly s3: S3Client,
        @Inject(appConfig.KEY) private readonly appCfg: ConfigType<typeof appConfig>,
    ) { }

    async uploadBuffer(
        fileBuffer: Buffer,
        mimeType: string,
        folder: string
    ): Promise<string> {
        const key = `${folder}/${uuid()}`;

        await this.s3.send(
            new PutObjectCommand({
                Bucket: this.appCfg.aws_s3_bucket,
                Key: key,
                Body: fileBuffer,
                ContentType: mimeType,
            })
        );

        return `https://s3.twcstorage.ru/${this.appCfg.aws_s3_bucket}/${key}`;
    }
}
