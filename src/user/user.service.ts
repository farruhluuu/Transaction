import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'
import Redis from 'ioredis';

@Injectable()
export class UserService {
  private readonly BALANCE_TTL = 60; 

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async getBalance(id: number) {
    const cacheKey = `balance:user:${id}`;

    const cachedBalance = await this.redis.get(cacheKey);
    if (cachedBalance !== null) {
      return Number(cachedBalance);
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { balance: true },
    });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    await this.redis.set(cacheKey, user.balance.toString(), 'EX', this.BALANCE_TTL)

    return user.balance;
  }

  async updateBalanceCache(userId: number, newBalance: number): Promise<void> {
    const cacheKey = `balance:user:${userId}`;
    await this.redis.set(cacheKey, newBalance.toString(), 'EX', this.BALANCE_TTL);
  }
}
