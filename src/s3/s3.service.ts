import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuid } from 'uuid';

@Injectable()
export class S3Service {
    private s3: S3Client;

    constructor() {
        this.s3 = new S3Client({
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            },
            endpoint: 'https://s3.twcstorage.ru',
            forcePathStyle: true,
            region: 'ru-1',
        });
    }

    async uploadBuffer(
        fileBuffer: Buffer,
        mimeType: string,
        folder: string,
        filename: string
    ): Promise<string> {
        const key = `${folder}/${uuid()}`;

        await this.s3.send(
            new PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET!,
                Key: key,
                Body: fileBuffer,
                ContentType: mimeType,
            })
        );

        return `https://s3.twcstorage.ru/${process.env.AWS_S3_BUCKET}/${key}`;
    }
}
