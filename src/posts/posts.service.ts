import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class PostsService {
    constructor(
        private prisma: PrismaService,
        private s3: S3Service,
    ) { }

    async create(data: { caption?: string; userId: number }, file: { buffer: Buffer; filename: string; mimetype: string }) {
        const imageUrl = await this.s3.uploadBuffer(file.buffer, file.mimetype, 'posts', file.filename);

        return this.prisma.post.create({
            data: {
                caption: data.caption,
                imageUrl,
                userId: data.userId,
            },
        });
    }

    async findAll() {
        return this.prisma.post.findMany({
            include: { user: true, likes: true, comments: true },
        });
    }

    async delete(userId: number, id: number) {
        const post = await this.prisma.post.findUnique({
            where: { id },
            select: { userId: true },
        });

        if (!post) {
            throw new ForbiddenException('Post not found');
        }

        if (post.userId !== userId) {
            throw new ForbiddenException('You are not allowed to delete this post');
        }

        return post;
    }
}
