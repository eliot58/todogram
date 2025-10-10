import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CloseFriendsService {
    constructor(private readonly prisma: PrismaService) { }

    async addManyToCloseFriends(ownerId: number, friendIds: number[]) {
        if (!Array.isArray(friendIds) || friendIds.length === 0) {
            throw new BadRequestException('ids пустой');
        }

        const uniqueIds = [...new Set(friendIds)].filter((id) => id !== ownerId);

        if (uniqueIds.length === 0) {
            throw new BadRequestException('Нечего добавлять');
        }

        const existing = await this.prisma.user.findMany({
            where: { id: { in: uniqueIds } },
            select: { id: true },
        });
        const existingIds = new Set(existing.map((u) => u.id));
        const toInsert = uniqueIds.filter((id) => existingIds.has(id));

        if (toInsert.length === 0) {
            throw new NotFoundException('Пользователи не найдены');
        }

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
                avatarUrl: true
            },
        });

        return {
            ok: true,
            created: createdCount,
            requested: uniqueIds.length,
            items,
        };
    }

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
}
