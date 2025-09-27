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
                notify: true,
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

    async toggleNotify(userId: number) {
        const current = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { notify: true },
        });
        if (!current) throw new NotFoundException('User not found');

        const updated = await this.prisma.user.update({
            where: { id: userId },
            data: { notify: !current.notify },
            select: { notify: true },
        });

        return updated;
    }

    async follow(userId: number, targetId: number) {
        if (userId === targetId) throw new BadRequestException('You cannot follow yourself');

        const target = await this.prisma.user.findUnique({
            where: { id: targetId },
            select: { id: true, isPrivate: true },
        });
        if (!target) throw new NotFoundException('User not found');

        const already = await this.prisma.follower.findUnique({
            where: { followerId_followingId: { followerId: userId, followingId: targetId } },
        });
        if (already) return { message: 'Already following this user' };

        if (target.isPrivate) {
            await this.prisma.followRequest.upsert({
                where: { requesterId_targetId: { requesterId: userId, targetId } },
                update: { status: 'PENDING' },
                create: { requesterId: userId, targetId, status: 'PENDING' },
                select: { id: true, status: true, createdAt: true },
            });

            return { message: 'Account is private request created' };
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.follower.create({
                data: { followerId: userId, followingId: targetId },
            });
            await tx.user.update({ where: { id: userId }, data: { followingCount: { increment: 1 } } });
            await tx.user.update({ where: { id: targetId }, data: { followersCount: { increment: 1 } } });
            await tx.followRequest.deleteMany({ where: { requesterId: userId, targetId } });
        });

        return { message: 'Successfully followed the user' };
    }

    async cancelFollowRequest(viewerId: number, targetId: number) {
        await this.prisma.followRequest.deleteMany({
            where: { requesterId: viewerId, targetId, status: 'PENDING' },
        });
        return { status: 'canceled' };
    }

    async acceptFollowRequest(targetId: number, requesterId: number) {
        const req = await this.prisma.followRequest.findUnique({
            where: { requesterId_targetId: { requesterId, targetId } },
            select: { status: true },
        });
        if (!req || req.status !== 'PENDING') throw new NotFoundException('Request not found');

        await this.prisma.$transaction(async (tx) => {
            await tx.follower.upsert({
                where: { followerId_followingId: { followerId: requesterId, followingId: targetId } },
                update: {},
                create: { followerId: requesterId, followingId: targetId },
            });

            await tx.user.update({ where: { id: requesterId }, data: { followingCount: { increment: 1 } } });
            await tx.user.update({ where: { id: targetId }, data: { followersCount: { increment: 1 } } });

            await tx.followRequest.update({
                where: { requesterId_targetId: { requesterId, targetId } },
                data: { status: 'ACCEPTED' },
            });
        });

        return { status: 'accepted' };
    }

    async rejectFollowRequest(targetId: number, requesterId: number) {
        const req = await this.prisma.followRequest.findUnique({
            where: { requesterId_targetId: { requesterId, targetId } },
            select: { status: true },
        });
        if (!req || req.status !== 'PENDING') throw new NotFoundException('Request not found');

        await this.prisma.followRequest.update({
            where: { requesterId_targetId: { requesterId, targetId } },
            data: { status: 'REJECTED' },
        });
        return { status: 'rejected' };
    }

    async listIncomingFollowRequests(userId: number, cursor?: number, limit: number = 20) {
        const take = Math.min(Math.max(limit || 20, 1), 100);
        const rows = await this.prisma.followRequest.findMany({
            where: { targetId: userId, status: 'PENDING' },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            take,
            select: {
                id: true,
                requesterId: true,
                createdAt: true,
                requester: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
            },
        });

        const items = rows.map((r) => ({
            id: r.id,
            requester: r.requester,
            createdAt: r.createdAt,
        }));
        const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;

        return { items, nextCursor };
    }

    async listOutgoingFollowRequests(userId: number, cursor?: number, limit: number = 20) {
        const take = Math.min(Math.max(limit || 20, 1), 100);
        const rows = await this.prisma.followRequest.findMany({
            where: { requesterId: userId, status: 'PENDING' },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            take,
            select: {
                id: true,
                targetId: true,
                createdAt: true,
                target: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
            },
        });

        const items = rows.map((r) => ({
            id: r.id,
            target: r.target,
            createdAt: r.createdAt,
        }));
        const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;

        return { items, nextCursor };
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
                id: r.follower.id,
                username: r.follower.username,
                fullName: r.follower.fullName,
                avatarUrl: r.follower.avatarUrl
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
                id: r.following.id,
                username: r.following.username,
                fullName: r.following.fullName,
                avatarUrl: r.following.avatarUrl
            })),
            nextCursor: hasMore ? slice[slice.length - 1].id : null,
        };
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

    async addManyToCloseFriends(ownerId: number, friendIds: number[]) {
        if (!Array.isArray(friendIds) || friendIds.length === 0) {
            throw new BadRequestException('ids пустой');
        }

        // убираем дубли/самого себя
        const uniqueIds = [...new Set(friendIds)].filter((id) => id !== ownerId);

        if (uniqueIds.length === 0) {
            throw new BadRequestException('Нечего добавлять');
        }

        // проверяем, что такие пользователи существуют
        const existing = await this.prisma.user.findMany({
            where: { id: { in: uniqueIds } },
            select: { id: true },
        });
        const existingIds = new Set(existing.map((u) => u.id));
        const toInsert = uniqueIds.filter((id) => existingIds.has(id));

        if (toInsert.length === 0) {
            throw new NotFoundException('Пользователи не найдены');
        }

        // транзакция: createMany(skipDuplicates) + инкремент на созданное кол-во
        const { createdCount } = await this.prisma.$transaction(async (tx) => {
            const created = await tx.closeFriend.createMany({
                data: toInsert.map((friendId) => ({ ownerId, friendId })),
                skipDuplicates: true,
            });

            if (created.count > 0) {
                await tx.user.update({
                    where: { id: ownerId },
                    data: { closeFriendsCount: { increment: created.count } },
                });
            }

            return { createdCount: created.count };
        });

        const items = await this.prisma.user.findMany({
            where: { id: { in: toInsert } },
            select: {
                id: true,
                username: true,
                fullName: true,
                avatarUrl: true,
                isPrivate: true,
                isVerify: true,
            },
        });

        return {
            ok: true,
            created: createdCount,
            requested: uniqueIds.length,
            items,
        };
    }

    // ---- BULK REMOVE ----
    async removeManyFromCloseFriends(ownerId: number, friendIds: number[]) {
        if (!Array.isArray(friendIds) || friendIds.length === 0) {
            throw new BadRequestException('ids пустой');
        }

        const uniqueIds = [...new Set(friendIds)].filter((id) => id !== ownerId);
        if (uniqueIds.length === 0) {
            return { ok: true, removed: 0 };
        }

        const { removedCount } = await this.prisma.$transaction(async (tx) => {
            const del = await tx.closeFriend.deleteMany({
                where: { ownerId, friendId: { in: uniqueIds } },
            });

            if (del.count > 0) {
                await tx.user.update({
                    where: { id: ownerId },
                    data: { closeFriendsCount: { decrement: del.count } },
                });
            }

            return { removedCount: del.count };
        });

        return { ok: true, removed: removedCount };
    }

    async getMyCloseFriends(viewerId: number, cursor?: number, limit: number = 20) {
        const take = Math.min(Math.max(limit || 20, 1), 100);

        const rows = await this.prisma.follower.findMany({
            where: { followerId: viewerId },
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
                        isPrivate: true,
                        isVerify: true,
                        _count: {
                            select: {
                                inCloseFriendsOf: { where: { ownerId: viewerId } },
                            },
                        },
                    },
                },
            },
        });

        const items = rows.map(r => ({
            id: r.following.id,
            username: r.following.username,
            fullName: r.following.fullName,
            avatarUrl: r.following.avatarUrl,
            isPrivate: r.following.isPrivate,
            isVerify: r.following.isVerify,
            isCloseFriend: r.following._count.inCloseFriendsOf > 0,
        }));

        const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;
        return { items, nextCursor };
    }

    async blockUser(ownerId: number, targetId: number) {
        const target = await this.prisma.user.findUnique({
            where: { id: targetId },
            select: { id: true },
        });
        if (!target) throw new NotFoundException('User not found');

        try {
            const item = await this.prisma.$transaction(async (tx) => {
                const created = await tx.block.create({
                    data: { blockerId: ownerId, blockedId: targetId },
                    include: {
                        blocked: {
                            select: {
                                id: true,
                                username: true,
                                fullName: true,
                                avatarUrl: true,
                                isPrivate: true,
                                isVerify: true,
                            },
                        },
                    },
                });

                const delOwnerFollowing = await tx.follower.deleteMany({
                    where: { followerId: ownerId, followingId: targetId },
                });
                if (delOwnerFollowing.count > 0) {
                    await tx.user.update({
                        where: { id: ownerId },
                        data: { followingCount: { decrement: delOwnerFollowing.count } },
                    });
                    await tx.user.update({
                        where: { id: targetId },
                        data: { followersCount: { decrement: delOwnerFollowing.count } },
                    });
                }

                const delTargetFollowing = await tx.follower.deleteMany({
                    where: { followerId: targetId, followingId: ownerId },
                });
                if (delTargetFollowing.count > 0) {
                    await tx.user.update({
                        where: { id: targetId },
                        data: { followingCount: { decrement: delTargetFollowing.count } },
                    });
                    await tx.user.update({
                        where: { id: ownerId },
                        data: { followersCount: { decrement: delTargetFollowing.count } },
                    });
                }

                await tx.user.update({
                    where: { id: ownerId },
                    data: { blockedCount: { increment: 1 } },
                });

                await tx.followRequest.deleteMany({
                    where: {
                        OR: [
                            { requesterId: ownerId, targetId },
                            { requesterId: targetId, targetId: ownerId },
                        ],
                    },
                });
                await tx.closeFriend.deleteMany({
                    where: {
                        OR: [
                            { ownerId: ownerId, friendId: targetId },
                            { ownerId: targetId, friendId: ownerId },
                        ],
                    },
                });

                return created;
            });

            return { ok: true, item };
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                const item = await this.prisma.block.findUnique({
                    where: { blockerId_blockedId: { blockerId: ownerId, blockedId: targetId } },
                    include: {
                        blocked: {
                            select: {
                                id: true,
                                username: true,
                                fullName: true,
                                avatarUrl: true,
                                isPrivate: true,
                                isVerify: true,
                            },
                        },
                    },
                });
                return { ok: true, item };
            }
            throw e;
        }
    }

    async unblockUser(ownerId: number, targetId: number) {
        const exists = await this.prisma.block.findUnique({
            where: { blockerId_blockedId: { blockerId: ownerId, blockedId: targetId } },
            select: { id: true },
        });

        if (!exists) return { ok: true, removed: false };

        await this.prisma.$transaction(async (tx) => {
            await tx.block.delete({ where: { blockerId_blockedId: { blockerId: ownerId, blockedId: targetId } } });
            await tx.user.update({ where: { id: ownerId }, data: { blockedCount: { decrement: 1 } } });
        });

        return { ok: true, removed: true };
    }

    async getMyBlocked(viewerId: number, cursor?: number, limit: number = 20) {
        const take = Math.min(Math.max(limit || 20, 1), 100);

        const rows = await this.prisma.block.findMany({
            where: { blockerId: viewerId },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            take,
            include: {
                blocked: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        avatarUrl: true,
                        isPrivate: true,
                        isVerify: true,
                    },
                },
            },
        });

        const items = rows.map(({ blocked }) => ({
            id: blocked.id,
            username: blocked.username,
            fullName: blocked.fullName,
            avatarUrl: blocked.avatarUrl,
            isPrivate: blocked.isPrivate,
            isVerify: blocked.isVerify,
        }));

        const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;
        return { items, nextCursor };
    }
}
