import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { Prisma } from 'generated/prisma';

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService, private s3: S3Service) { }

    async getUserById(userId: number) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                fullName: true,
                bio: true,
                followersCount: true,
                followingCount: true,
                postCount: true,
                avatarUrl: true,
                isVerify: true,
                isPrivate: true,
                createdAt: true,
            },
        });
    }

    async updateProfile(
        userId: number,
        dto: any,
        avatar?: { buffer: Buffer; filename: string; mimetype: string } | null
    ) {
        if ('avatar' in dto) delete dto.avatar;

        if (dto.username) {
            const exists = await this.prisma.user.findFirst({
                where: { username: dto.username, NOT: { id: userId } },
            });
            if (exists) throw new BadRequestException('Username already taken');
        }

        if (dto.email) {
            const exists = await this.prisma.user.findFirst({
                where: { email: dto.email, NOT: { id: userId } },
            });
            if (exists) throw new BadRequestException('Email already taken');
        }

        let avatarUrl: string | undefined;
        if (avatar) {
            avatarUrl = await this.s3.uploadBuffer(avatar.buffer, avatar.mimetype, `avatars`);
        }

        const user = await this.prisma.user.update({
            where: { id: userId },
            data: { ...dto, ...(avatarUrl ? { avatarUrl } : {}) },
            select: {
                id: true,
                username: true,
                fullName: true,
                bio: true,
                avatarUrl: true,
                email: true,
                isVerify: true,
                createdAt: true,
            },
        });

        return { message: 'Profile updated successfully', user };
    }

    async togglePrivacy(userId: number) {
        const current = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { isPrivate: true },
        });
        if (!current) throw new NotFoundException('User not found');

        const updated = await this.prisma.user.update({
            where: { id: userId },
            data: { isPrivate: !current.isPrivate },
            select: { isPrivate: true },
        });

        return updated;
    }

    async follow(userId: number, targetId: number) {
        if (userId === targetId) throw new BadRequestException('You cannot follow yourself');

        await this.prisma.$transaction(async (tx) => {
            await tx.follower.create({ data: { followerId: userId, followingId: targetId } });

            await tx.user.update({
                where: { id: targetId },
                data: { followersCount: { increment: 1 } },
            });
            await tx.user.update({
                where: { id: userId },
                data: { followingCount: { increment: 1 } },
            });
        }).catch((e: any) => {
            if (e?.code === 'P2002') throw new BadRequestException('Already following this user');
            throw e;
        });

        return { message: 'Successfully followed the user' };
    }

    async unfollow(userId: number, targetId: number) {
        if (userId === targetId) throw new BadRequestException('You cannot unfollow yourself');

        await this.prisma.$transaction(async (tx) => {
            const del = await tx.follower.deleteMany({
                where: { followerId: userId, followingId: targetId },
            });
            if (del.count === 0) throw new BadRequestException('You are not following this user');

            await tx.user.updateMany({
                where: { id: targetId, followersCount: { gt: 0 } },
                data: { followersCount: { decrement: 1 } },
            });
            await tx.user.updateMany({
                where: { id: userId, followingCount: { gt: 0 } },
                data: { followingCount: { decrement: 1 } },
            });
        });

        return { message: 'Successfully unfollowed the user' };
    }

    async getFollowers(meId: number, cursor?: number | null, limit: number = 20) {
        const cursorInput = cursor && Number.isFinite(cursor) ? { id: cursor } : undefined;

        const rows = await this.prisma.follower.findMany({
            where: { followingId: meId },
            orderBy: { id: 'desc' },
            take: limit + 1,
            skip: cursorInput ? 1 : 0,
            cursor: cursorInput,
            include: {
                follower: {
                    select: { id: true, username: true, fullName: true, avatarUrl: true },
                },
            },
        });

        const hasMore = rows.length > limit;
        const slice = rows.slice(0, limit);

        return {
            items: slice.map((r) => ({
                relId: r.id,
                followedAt: r.createdAt,
                user: r.follower,
            })),
            nextCursor: hasMore ? slice[slice.length - 1].id : null,
        };
    }

    async getFollowing(meId: number, cursor?: number | null, limit: number = 20) {
        const cursorInput = cursor && Number.isFinite(cursor) ? { id: cursor } : undefined;

        const rows = await this.prisma.follower.findMany({
            where: { followerId: meId },
            orderBy: { id: 'desc' },
            take: limit + 1,
            skip: cursorInput ? 1 : 0,
            cursor: cursorInput,
            include: {
                following: {
                    select: { id: true, username: true, fullName: true, avatarUrl: true },
                },
            },
        });

        const hasMore = rows.length > limit;
        const slice = rows.slice(0, limit);

        return {
            items: slice.map((r) => ({
                relId: r.id,
                followedAt: r.createdAt,
                user: r.following,
            })),
            nextCursor: hasMore ? slice[slice.length - 1].id : null,
        };
    }

    async getUserPublications(
        viewerId: number,
        targetId: number,
        { isReels, cursor, limit }: { isReels: boolean; cursor?: number; limit?: number }
    ) {
        const exists = await this.prisma.user.findUnique({
            where: { id: targetId },
            select: { id: true, isPrivate: true },
        });
        if (!exists) throw new NotFoundException('User not found');

        if (exists.isPrivate) throw new ForbiddenException('User isPrivate');

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
            },
            liked: p.likes.length > 0,
            saved: p.savedBy.length > 0,
            followsAuthor: p.user.followers.length > 0,
        }));

        const hasMore = posts.length === take;
        const nextCursor = hasMore ? posts[posts.length - 1].id : null;

        return { items, nextCursor };
    }

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
            },
            liked: p.likes.length > 0,
            saved: p.savedBy.length > 0,
            followsAuthor: p.user.followers.length > 0,
        }));

        const hasMore = posts.length === take;
        const nextCursor = hasMore ? posts[posts.length - 1].id : null;

        return { items, nextCursor };
    }

    async searchUsers(viewerId: number, q?: string, cursor?: number, limit = 20) {
        const query = (q ?? '').trim();
        if (query.length < 1) throw new BadRequestException('Query must be at least 1 characters long');

        const take = Math.min(Math.max(limit || 20, 1), 100);

        const where: Prisma.UserWhereInput = {
            id: { not: viewerId },
            ...(query
                ? {
                    OR: [
                        { username: { contains: query, mode: Prisma.QueryMode.insensitive } },
                        { fullName: { contains: query, mode: Prisma.QueryMode.insensitive } },
                        { bio: { contains: query, mode: Prisma.QueryMode.insensitive } },
                    ],
                }
                : {}),
        };

        const users = await this.prisma.user.findMany({
            where,
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            take,
            select: { id: true, username: true, fullName: true, avatarUrl: true, bio: true },
        });

        const items = users.map((u) => ({
            id: u.id,
            username: u.username,
            fullName: u.fullName,
            avatarUrl: u.avatarUrl,
            bio: u.bio,
        }));

        const hasMore = users.length === take;
        const nextCursor = hasMore ? users[users.length - 1].id : null;
        return { items, nextCursor };
    }

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
                followers: { where: { followerId: viewerId }, select: { id: true }, take: 1 },
                following: { where: { followingId: viewerId }, select: { id: true }, take: 1 },
            },
        });

        if (!user) throw new NotFoundException('User not found');

        const isFollowedByViewer = user.followers.length > 0;
        const isFollowingViewer = user.following.length > 0;

        return {
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            avatarUrl: user.avatarUrl,
            bio: user.bio,
            counts: {
                followers: user.followersCount,
                following: user.followingCount,
                posts: user.postCount
            },
            viewer: {
                isFollowing: isFollowedByViewer,
                isFollowedBy: isFollowingViewer,
            },
        };
    }

    async getFollowersOfUser(viewerId: number, userId: number, cursor?: number, limit: number = 20) {
        const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, isPrivate: true} });
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
                    },
                },
            },
        });

        const items = rows.map(({ follower }) => ({
            id: follower.id,
            username: follower.username,
            fullName: follower.fullName,
            avatarUrl: follower.avatarUrl,
            counts: {
                followers: follower.followersCount,
                following: follower.followingCount,
            },
            viewer: {
                isFollowing: follower.followers.length > 0,
                isFollowedBy: follower.following.length > 0,
            },
            isMe: follower.id === viewerId,
        }));

        const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;
        return { items, nextCursor };
    }

    async getFollowingOfUser(viewerId: number, userId: number, cursor?: number, limit: number = 20) {
        const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, isPrivate: true } });
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
                    },
                },
            },
        });

        const items = rows.map(({ following }) => ({
            id: following.id,
            username: following.username,
            fullName: following.fullName,
            avatarUrl: following.avatarUrl,
            counts: {
                followers: following.followersCount,
                following: following.followingCount,
            },
            viewer: {
                isFollowing: following.followers.length > 0,
                isFollowedBy: following.following.length > 0,
            },
            isMe: following.id === viewerId,
        }));

        const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;
        return { items, nextCursor };
    }

    async isUsernameAvailable(username: string): Promise<boolean> {
        const existing = await this.prisma.user.findFirst({
            where: { username: { equals: username, mode: 'insensitive' } },
            select: { id: true },
        });
        return !existing;
    }


    async addToCloseFriends(ownerId: number, friendId: number) {
        const friend = await this.prisma.user.findUnique({ where: { id: friendId }, select: { id: true } });
        if (!friend) throw new NotFoundException('User not found');

        try {
            const item = await this.prisma.closeFriend.create({
                data: { ownerId, friendId },
                include: {
                    friend: {
                        select: { id: true, username: true, fullName: true, avatarUrl: true, isPrivate: true, isVerify: true },
                    },
                },
            });
            return { ok: true, item };
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                const item = await this.prisma.closeFriend.findUnique({
                    where: { ownerId_friendId: { ownerId, friendId } },
                    include: {
                        friend: { select: { id: true, username: true, fullName: true, avatarUrl: true, isPrivate: true, isVerify: true } },
                    },
                });
                return { ok: true, item };
            }
            throw e;
        }
    }

    async removeFromCloseFriends(ownerId: number, friendId: number) {
        const exists = await this.prisma.closeFriend.findUnique({
            where: { ownerId_friendId: { ownerId, friendId } },
            select: { id: true },
        });

        if (!exists) return { ok: true, removed: false };

        await this.prisma.closeFriend.delete({
            where: { ownerId_friendId: { ownerId, friendId } },
        });

        return { ok: true, removed: true };
    }

    async getMyCloseFriends(viewerId: number, cursor?: number, limit: number = 20) {
        const take = Math.min(Math.max(limit || 20, 1), 100);

        const rows = await this.prisma.closeFriend.findMany({
            where: { ownerId: viewerId },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            take,
            include: {
                friend: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        avatarUrl: true,
                    },
                },
            },
        });

        const items = rows.map(({ friend }) => ({
            id: friend.id,
            username: friend.username,
            fullName: friend.fullName,
            avatarUrl: friend.avatarUrl,
        }));

        const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;

        return { items, nextCursor };
    }


}
