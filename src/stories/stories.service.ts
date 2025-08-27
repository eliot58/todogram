import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { isImage, isVideo } from '../helper/mime';

type StoryFile = { buffer: Buffer; filename: string; mimetype: string };

@Injectable()
export class StoriesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly s3: S3Service,
    ) { }

    private assertFile(kind: 'image' | 'video', file: StoryFile | null) {
        if (!file) throw new BadRequestException('File is required');

        if (kind === 'image') {
            if (!isImage(file.mimetype)) {
                throw new BadRequestException(`Invalid image mime type: ${file.mimetype}`);
            }
        } else if (kind === 'video') {
            if (!isVideo(file.mimetype)) {
                throw new BadRequestException(`Invalid video mime type: ${file.mimetype}`);
            }
        } else {
            throw new BadRequestException('Unknown story kind');
        }
    }

    async create(input: {
        userId: number;
        file: StoryFile;
        kind: 'image' | 'video';
        expiresAt: Date;
    }) {
        const { userId, file, kind, expiresAt } = input;

        this.assertFile(kind, file);

        let imageUrl: string | null = null;
        let videoUrl: string | null = null;

        if (kind === 'image') {
            imageUrl = await this.s3.uploadBuffer(file.buffer, file.mimetype, 'stories/images');
        } else {
            videoUrl = await this.s3.uploadBuffer(file.buffer, file.mimetype, 'stories/videos');
        }

        const story = await this.prisma.story.create({
            data: {
                userId,
                imageUrl,
                videoUrl,
                expiresAt,
            },
            include: {
                user: { select: { id: true, username: true, avatarUrl: true, fullName: true } },
                _count: { select: { views: true } },
            },
        });

        return story;
    }

    async delete(userId: number, storyId: number) {
        const story = await this.prisma.story.findUnique({
            where: { id: storyId },
            select: { id: true, userId: true },
        });

        if (!story) throw new ForbiddenException('Story not found');
        if (story.userId !== userId) {
            throw new ForbiddenException('You are not allowed to delete this story');
        }

        await this.prisma.story.delete({ where: { id: storyId } });
        return { message: 'Deleted' };
    }
}
