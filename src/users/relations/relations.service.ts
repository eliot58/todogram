import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RelationsService {
    constructor(private readonly prisma: PrismaService) { }

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
}
