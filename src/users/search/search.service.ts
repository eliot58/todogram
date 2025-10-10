import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../../generated/prisma';

@Injectable()
export class SearchService {
    constructor(private readonly prisma: PrismaService) { }

    async searchUsers(viewerId: number, q?: string, cursor?: number, limit = 20) {
        const query = (q ?? '').trim();
        if (query.length < 1) throw new BadRequestException('Query must be at least 1 characters long');

        const take = Math.min(Math.max(limit || 20, 1), 100);

        const where: Prisma.UserWhereInput = {
            id: { not: viewerId },
            blockedUsers: { none: { blockedId: viewerId } },
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
}
