import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PublicService {
    constructor(private readonly prisma: PrismaService) { }

    async getUserPublicProfile(viewerId: number, userId: number) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                fullName: true,
                avatarUrl: true,
                bio: true,
                followersCount: true,
                followingCount: true,
                postCount: true,
                isPrivate: true,
                followers: { where: { followerId: viewerId }, select: { id: true }, take: 1 },
                following: { where: { followingId: viewerId }, select: { id: true }, take: 1 },
                incomingFollowRequests: {
                    where: { requesterId: viewerId },
                    select: { id: true, status: true },
                    take: 1,
                },
            },
        });

        if (!user) throw new NotFoundException('User not found');

        const isFollowedByViewer = user.followers.length > 0;
        const isFollowingViewer = user.following.length > 0;

        const outgoingReq = user.incomingFollowRequests[0] || null;

        return {
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            avatarUrl: user.avatarUrl,
            bio: user.bio,
            isPrivate: user.isPrivate,
            counts: {
                followers: user.followersCount,
                following: user.followingCount,
                posts: user.postCount,
            },
            viewer: {
                isFollowing: isFollowedByViewer,
                isFollowedBy: isFollowingViewer,
                followRequest: outgoingReq ? { id: outgoingReq.id, status: outgoingReq.status } : null,
            },
        };
    }


    async getFollowersOfUser(
        viewerId: number,
        userId: number,
        cursor?: number,
        limit: number = 20,
    ) {
        const exists = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, isPrivate: true },
        });
        if (!exists) throw new NotFoundException('User not found');
        if (exists.isPrivate) throw new ForbiddenException('User isPrivate');

        const take = Math.min(Math.max(limit || 20, 1), 100);

        const rows = await this.prisma.follower.findMany({
            where: { followingId: userId },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            take,
            include: {
                follower: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        avatarUrl: true,
                        followersCount: true,
                        followingCount: true,
                        followers: { where: { followerId: viewerId }, select: { id: true }, take: 1 },
                        following: { where: { followingId: viewerId }, select: { id: true }, take: 1 },
                        incomingFollowRequests: {
                            where: { requesterId: viewerId },
                            select: { id: true, status: true },
                            take: 1,
                        },
                    },
                },
            },
        });

        const items = rows.map(({ follower }) => {
            const isFollowing = follower.followers.length > 0;
            const isFollowedBy = follower.following.length > 0;
            const req = follower.incomingFollowRequests[0] || null;

            return {
                id: follower.id,
                username: follower.username,
                fullName: follower.fullName,
                avatarUrl: follower.avatarUrl,
                counts: {
                    followers: follower.followersCount,
                    following: follower.followingCount,
                },
                viewer: {
                    isFollowing,
                    isFollowedBy,
                    followRequest: req ? { id: req.id, status: req.status } : null,
                },
                isMe: follower.id === viewerId,
            };
        });

        const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;
        return { items, nextCursor };
    }


    async getFollowingOfUser(
        viewerId: number,
        userId: number,
        cursor?: number,
        limit: number = 20,
    ) {
        const exists = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, isPrivate: true },
        });
        if (!exists) throw new NotFoundException('User not found');
        if (exists.isPrivate) throw new ForbiddenException('User isPrivate');

        const take = Math.min(Math.max(limit || 20, 1), 100);

        const rows = await this.prisma.follower.findMany({
            where: { followerId: userId },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            take,
            include: {
                following: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        avatarUrl: true,
                        followersCount: true,
                        followingCount: true,
                        followers: { where: { followerId: viewerId }, select: { id: true }, take: 1 },
                        following: { where: { followingId: viewerId }, select: { id: true }, take: 1 },
                        incomingFollowRequests: {
                            where: { requesterId: viewerId },
                            select: { id: true, status: true },
                            take: 1,
                        },
                    },
                },
            },
        });

        const items = rows.map(({ following }) => {
            const isFollowing = following.followers.length > 0;
            const isFollowedBy = following.following.length > 0;
            const req = following.incomingFollowRequests[0] || null;

            return {
                id: following.id,
                username: following.username,
                fullName: following.fullName,
                avatarUrl: following.avatarUrl,
                counts: {
                    followers: following.followersCount,
                    following: following.followingCount,
                },
                viewer: {
                    isFollowing,
                    isFollowedBy,
                    followRequest: req ? { id: req.id, status: req.status } : null,
                },
                isMe: following.id === viewerId,
            };
        });

        const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;
        return { items, nextCursor };
    }

    async getUserPublications(
        viewerId: number,
        targetId: number,
        { isReels, cursor, limit }: { isReels: boolean | undefined; cursor?: number; limit?: number }
    ) {
        const exists = await this.prisma.user.findUnique({
            where: { id: targetId },
            select: { id: true, isPrivate: true },
        });
        if (!exists) throw new NotFoundException('User not found');

        const blocked = await this.prisma.block.findFirst({
            where: { blockerId: targetId, blockedId: viewerId },
            select: { id: true },
        });
        if (blocked) {
            return { items: [], nextCursor: null };
        }

        if (viewerId !== targetId && exists.isPrivate) throw new ForbiddenException('User isPrivate');

        const take = Math.min(Math.max(limit || 20, 1), 100);

        const posts = await this.prisma.post.findMany({
            where: { userId: targetId, isReels },
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
                        incomingFollowRequests: {
                            where: { requesterId: viewerId },
                            select: { id: true, status: true },
                            take: 1,
                        },
                    },
                },
                likes: { where: { userId: viewerId }, select: { id: true }, take: 1 },
                savedBy: { where: { userId: viewerId }, select: { id: true }, take: 1 },
            },
        });

        const items = posts.map((p) => {
            const followReq = p.user.incomingFollowRequests?.[0] || null;
            return {
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
                followRequest: followReq ? { id: followReq.id, status: followReq.status } : null,
            };
        });

        const hasMore = posts.length === take;
        const nextCursor = hasMore ? posts[posts.length - 1].id : null;

        return { items, nextCursor };
    }
}
