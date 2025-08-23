import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

type ImageFile = { buffer: Buffer; filename: string; mimetype: string };
type VideoFile = { buffer: Buffer; filename: string; mimetype: string };

@Injectable()
export class PostsService {
    constructor(private prisma: PrismaService, private s3: S3Service) { }

    private isImage(mime: string) {
        return /^image\/(jpe?g|png|webp|gif|avif)$/.test(mime);
    }
    private isVideo(mime: string) {
        return /^video\/(mp4|quicktime|x-matroska|webm|ogg)$/.test(mime);
    }

    private assertPayload(
        input: { isReels: boolean },
        files: { images: ImageFile[]; video: VideoFile | null }
    ) {
        if (input.isReels) {
            if (!files.video) throw new BadRequestException('video is required for reels');
            if (files.images.length > 0) throw new BadRequestException('images are not allowed for reels');
            if (!this.isVideo(files.video.mimetype)) throw new BadRequestException('Invalid video mime type');
        } else {
            if (files.images.length === 0) throw new BadRequestException('At least one image is required');
            if (files.video) throw new BadRequestException('video is not allowed for non-reels post');
            for (const img of files.images) {
                if (!this.isImage(img.mimetype)) throw new BadRequestException(`Invalid image mime type: ${img.mimetype}`);
            }
        }
    }

    async create(
        data: { caption?: string; isReels: boolean; userId: number },
        files: { images: ImageFile[]; video: VideoFile | null }
    ) {
        this.assertPayload(data, files);

        if (data.isReels) {
            const videoUrl = await this.s3.uploadBuffer(files.video!.buffer, files.video!.mimetype, 'posts/videos', files.video!.filename);

            const post = await this.prisma.post.create({
                data: {
                    caption: data.caption,
                    isReels: true,
                    videoUrl,
                    userId: data.userId,
                },
                include: {
                    images: true,
                    user: { select: { id: true, username: true, avatarUrl: true } },
                    _count: { select: { likes: true, comments: true, savedBy: true } },
                },
            });

            return post;
        } else {
            const uploaded = await Promise.all(
                files.images.map((img, idx) =>
                    this.s3.uploadBuffer(img.buffer, img.mimetype, 'posts/images', img.filename).then((url) => ({
                        url,
                        position: idx,
                    }))
                )
            );

            const post = await this.prisma.post.create({
                data: {
                    caption: data.caption,
                    isReels: false,
                    userId: data.userId,
                    images: {
                        create: uploaded.map((u) => ({ url: u.url, position: u.position })),
                    },
                },
                include: {
                    images: { orderBy: { position: 'asc' } },
                    user: { select: { id: true, username: true, avatarUrl: true } },
                    _count: { select: { likes: true, comments: true, savedBy: true } },
                },
            });

            return post;
        }
    }

    async findAll() {
        return this.prisma.post.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                images: { orderBy: { position: 'asc' } },
                user: { select: { id: true, username: true, avatarUrl: true, fullName: true } },
                _count: { select: { likes: true, comments: true, savedBy: true } },
            },
        });
    }

    async delete(userId: number, id: number) {
        const post = await this.prisma.post.findUnique({
            where: { id },
            select: { userId: true },
        });

        if (!post) throw new ForbiddenException('Post not found');
        if (post.userId !== userId) throw new ForbiddenException('You are not allowed to delete this post');

        await this.prisma.post.delete({ where: { id } });
        return { message: 'Deleted' };
    }
}
