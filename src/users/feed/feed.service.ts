import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FeedService {
    constructor(private readonly prisma: PrismaService) { }

    async getFollowedPublications(
        viewerId: number,
        { cursor, limit }: { cursor?: number; limit?: number }
    ) {
        const take = Math.min(Math.max(limit || 20, 1), 100);

        const following = await this.prisma.follower.findMany({
            where: { followerId: viewerId },
            select: { followingId: true },
        });

        const followingIds = following
            .map((f) => f.followingId)
            .filter((id): id is number => typeof id === 'number');

        if (followingIds.length === 0) {
            return { items: [], nextCursor: null, hasMore: false };
        }

        const posts = await this.prisma.post.findMany({
            where: { userId: { in: followingIds } },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            take,
            select: {
                id: true,
                caption: true,
                isReels: true,
                videoUrl: true,
                thumbnail: true,
                createdAt: true,
                likesCount: true,
                commentsCount: true,
                savedCount: true,
                shareCount: true,
                viewsCount: true,
                images: { orderBy: { position: 'asc' }, select: { id: true, url: true, position: true, createdAt: true } },
                user: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        avatarUrl: true,
                        followers: { where: { followerId: viewerId }, select: { id: true }, take: 1 },
                    },
                },
                likes: { where: { userId: viewerId }, select: { id: true }, take: 1 },
                savedBy: { where: { userId: viewerId }, select: { id: true }, take: 1 },
            },
        });

        const items = posts.map((p) => ({
            id: p.id,
            caption: p.caption,
            isReels: p.isReels,
            videoUrl: p.videoUrl,
            thumbnail: p.thumbnail,
            createdAt: p.createdAt,
            user: {
                id: p.user.id,
                username: p.user.username,
                fullName: p.user.fullName,
                avatarUrl: p.user.avatarUrl,
            },
            images: p.images,
            counts: {
                likes: p.likesCount,
                comments: p.commentsCount,
                saved: p.savedCount,
                shared: p.shareCount,
                viewed: p.viewsCount
            },
            liked: p.likes.length > 0,
            saved: p.savedBy.length > 0,
            followsAuthor: p.user.followers.length > 0,
        }));

        const hasMore = posts.length === take;
        const nextCursor = hasMore ? posts[posts.length - 1].id : null;

        return { items, nextCursor };
    }
}
