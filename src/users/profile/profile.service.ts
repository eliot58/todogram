import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../..//s3/s3.service';

@Injectable()
export class ProfileService {
    constructor(private readonly prisma: PrismaService, private readonly s3: S3Service) { }

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
                blockedCount: true,
                closeFriendsCount: true,
                postCount: true,
                avatarUrl: true,
                isVerify: true,
                isPrivate: true,
                notificationsEnabled: true,
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
            select: { notificationsEnabled: true },
        });
        if (!current) throw new NotFoundException('User not found');

        const updated = await this.prisma.user.update({
            where: { id: userId },
            data: { notificationsEnabled: !current.notificationsEnabled },
            select: { notificationsEnabled: true },
        });

        return updated;
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
            isCloseFriend: r.following._count.inCloseFriendsOf > 0,
        }));

        const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;
        return { items, nextCursor };
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
                        avatarUrl: true
                    },
                },
            },
        });

        const items = rows.map(({ blocked }) => ({
            id: blocked.id,
            username: blocked.username,
            fullName: blocked.fullName,
            avatarUrl: blocked.avatarUrl
        }));

        const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;
        return { items, nextCursor };
    }
}
