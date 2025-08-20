import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.transaction.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        sender: {
          select: { id: true, name: true },
        },
        receiver: {
          select: { id: true, name: true },
        },
      },
    })
  }

  async getTransactionHistory(userId: string, date?: string) {
    const dateFilter = date
      ? {
          createdAt: {
            gte: new Date(date),
            lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000),
          },
        }
      : {};

    return this.prisma.transaction.findMany({
      where: {
        AND: [
          {
            OR: [{ senderId: Number(userId) }, { receiverId: Number(userId) }],
          },
          dateFilter,
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } },
      },
    });
  }
}
