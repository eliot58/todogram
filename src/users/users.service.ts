import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
                createdAt: true,
            },
        });
    }

    async updateProfile(
        userId: number,
        dto: any,
        avatar?: { buffer: Buffer; filename: string; mimetype: string } | null
    ) {
        if ('avatar' in dto) {
            delete dto.avatar;
        }

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
            avatarUrl = await this.s3.uploadBuffer(
                avatar.buffer,
                avatar.mimetype,
                `avatars`
            );

        }

        const updatedUser = await this.prisma.user.update({
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

        return { message: 'Profile updated successfully', user: updatedUser };
    }

    async follow(userId: number, targetId: number) {
        if (userId === targetId) {
            throw new BadRequestException('You cannot follow yourself');
        }

        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.follower.create({
                    data: { followerId: userId, followingId: targetId },
                });

                await tx.user.update({
                    where: { id: targetId },
                    data: { followersCount: { increment: 1 } },
                });
                await tx.user.update({
                    where: { id: userId },
                    data: { followingCount: { increment: 1 } },
                });
            });
        } catch (e: any) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new BadRequestException('Already following this user');
            }
            throw e;
        }

        return { message: 'Successfully followed the user' };
    }

    async unfollow(userId: number, targetId: number) {
        if (userId === targetId) {
            throw new BadRequestException('You cannot unfollow yourself');
        }

        await this.prisma.$transaction(async (tx) => {
            const res = await tx.follower.deleteMany({
                where: { followerId: userId, followingId: targetId },
            });

            if (res.count === 0) {
                throw new BadRequestException('You are not following this user');
            }

            await tx.user.update({
                where: { id: targetId },
                data: { followersCount: { decrement: 1 } },
            });
            await tx.user.update({
                where: { id: userId },
                data: { followingCount: { decrement: 1 } },
            });
        });

        return { message: 'Successfully unfollowed the user' };
    }

    async getFollowers(
        meId: number,
        cursor?: number | null,
        limit: number = 20,
    ) {
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
            items: slice.map(r => ({
                relId: r.id,
                followedAt: r.createdAt,
                user: r.follower,
            })),
            nextCursor: hasMore ? slice[slice.length - 1].id : null,
        };
    }

    async getFollowing(
        meId: number,
        cursor?: number | null,
        limit: number = 20,
    ) {
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
            items: slice.map(r => ({
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
        { isReels, cursor, limit },
    ) {
        const exists = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!exists) throw new NotFoundException('User not found');

        const take = Math.min(Math.max(limit || 20, 1), 100);

        const posts = await this.prisma.post.findMany({
            where: { userId: targetId, isReels },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: Number(cursor) } : undefined,
            skip: cursor ? 1 : 0,
            take,
            include: {
                images: { orderBy: { position: 'asc' } },
                user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                _count: { select: { likes: true, comments: true, savedBy: true } },
            },
        });

        const itemsIds = posts.map(p => p.id);
        let likedSet = new Set<number>();
        let savedSet = new Set<number>();

        if (itemsIds.length > 0) {
            const [likes, saved] = await Promise.all([
                this.prisma.like.findMany({
                    where: { userId: viewerId, postId: { in: itemsIds } },
                    select: { postId: true },
                }),
                this.prisma.savedPost.findMany({
                    where: { userId: viewerId, postId: { in: itemsIds } },
                    select: { postId: true },
                }),
            ]);

            const likeIds = likes
                .map(l => l.postId)
                .filter((id): id is number => typeof id === 'number');

            const savedIds = saved
                .map(s => s.postId)
                .filter((id): id is number => typeof id === 'number');

            likedSet = new Set<number>(likeIds);
            savedSet = new Set<number>(savedIds);
        }


        const items = posts.map(p => ({
            id: p.id,
            caption: p.caption,
            isReels: p.isReels,
            videoUrl: p.videoUrl,
            createdAt: p.createdAt,
            user: p.user,
            images: p.images,
            counts: {
                likes: p._count.likes,
                comments: p._count.comments,
                saved: p._count.savedBy,
            },
            liked: likedSet.has(p.id),
            saved: savedSet.has(p.id),
        }));

        const hasMore = posts.length === take;
        const nextCursor = hasMore ? posts[posts.length - 1].id : null;

        return { items, nextCursor };
    }

    async getFollowedPublications(
        viewerId: number,
        { cursor, limit },
    ) {
        const take = Math.min(Math.max(limit || 20, 1), 100);

        const following = await this.prisma.follower.findMany({
            where: { followerId: viewerId },
            select: { followingId: true },
        });

        const followingIds = following
            .map(f => f.followingId)
            .filter((id): id is number => typeof id === 'number');

        if (followingIds.length === 0) {
            return { items: [], nextCursor: null, hasMore: false };
        }

        const posts = await this.prisma.post.findMany({
            where: { userId: { in: followingIds } },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: Number(cursor) } : undefined,
            skip: cursor ? 1 : 0,
            take,
            include: {
                images: { orderBy: { position: 'asc' } },
                user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                _count: { select: { likes: true, comments: true, savedBy: true } },
            },
        });

        const ids = posts.map(p => p.id);

        let likedSet = new Set<number>();
        let savedSet = new Set<number>();

        if (ids.length > 0) {
            const [likes, saved] = await Promise.all([
                this.prisma.like.findMany({
                    where: { userId: viewerId, postId: { in: ids } },
                    select: { postId: true },
                }),
                this.prisma.savedPost.findMany({
                    where: { userId: viewerId, postId: { in: ids } },
                    select: { postId: true },
                }),
            ]);

            const likeIds = likes.map(l => l.postId).filter((id): id is number => typeof id === 'number');
            const savedIds = saved.map(s => s.postId).filter((id): id is number => typeof id === 'number');

            likedSet = new Set(likeIds);
            savedSet = new Set(savedIds);
        }

        const items = posts.map(p => ({
            id: p.id,
            caption: p.caption,
            isReels: p.isReels,
            videoUrl: p.videoUrl,
            createdAt: p.createdAt,
            user: p.user,
            images: p.images,
            counts: {
                likes: p._count.likes,
                comments: p._count.comments,
                saved: p._count.savedBy,
            },
            liked: likedSet.has(p.id),
            saved: savedSet.has(p.id),
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

        const items = users.map(u => ({
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
}
