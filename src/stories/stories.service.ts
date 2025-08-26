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

    async getFollowingActive(userId: number, page: number, limit: number) {
        const safePage = Math.max(page || 1, 1);
        const safeLimit = Math.min(Math.max(limit || 15, 1), 100);

        const following = await this.prisma.follower.findMany({
            where: { followerId: userId },
            select: { followingId: true },
        });
        const authorIds = following.map(f => f.followingId);

        if (authorIds.length === 0) {
            return { items: [], page: safePage, limit: safeLimit, hasMore: false };
        }

        const now = new Date();

        const latestRows = await this.prisma.story.findMany({
            where: { userId: { in: authorIds }, expiresAt: { gt: now } },
            select: { userId: true, createdAt: true, id: true },
            orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
            take: Math.max(authorIds.length * 3, 100),
        });

        const orderedUniqueUserIds: number[] = [];
        const seenSet = new Set<number>();
        for (const r of latestRows) {
            if (!seenSet.has(r.userId)) {
                seenSet.add(r.userId);
                orderedUniqueUserIds.push(r.userId);
            }
            if (orderedUniqueUserIds.length === authorIds.length) break;
        }

        if (orderedUniqueUserIds.length === 0) {
            return { items: [], page: safePage, limit: safeLimit, hasMore: false };
        }

        const start = (safePage - 1) * safeLimit;
        const end = start + safeLimit;
        const pageUserIds = orderedUniqueUserIds.slice(start, end);
        const hasMore = end < orderedUniqueUserIds.length;

        const rawStories = await this.prisma.story.findMany({
            where: { userId: { in: pageUserIds }, expiresAt: { gt: now } },
            orderBy: [{ userId: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }],
            include: {
                user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                views: { where: { viewerId: userId }, select: { id: true } },
            },
        });

        const byUser = new Map<number, { user: any; stories: any[] }>();
        for (const s of rawStories) {
            const bucket = byUser.get(s.userId) ?? {
                user: s.user,
                stories: [] as Array<{
                    id: number;
                    imageUrl: string | null;
                    videoUrl: string | null;
                    createdAt: Date;
                    expiresAt: Date;
                    seen: boolean;
                }>,
            };
            bucket.stories.push({
                id: s.id,
                imageUrl: s.imageUrl,
                videoUrl: s.videoUrl,
                createdAt: s.createdAt,
                expiresAt: s.expiresAt,
                seen: s.views.length > 0,
            });
            byUser.set(s.userId, bucket);
        }

        const items = pageUserIds
            .map(uid => {
                const bucket = byUser.get(uid);
                if (!bucket) return null;
                const hasUnseen = bucket.stories.some(st => !st.seen);
                const latestCreatedAt = bucket.stories.reduce(
                    (max, st) => (st.createdAt > max ? st.createdAt : max),
                    new Date(0),
                );
                return {
                    user: bucket.user,
                    hasUnseen,
                    latestCreatedAt,
                    stories: bucket.stories,
                };
            })
            .filter(Boolean);

        return { items, page: safePage, limit: safeLimit, hasMore };
    }
}
