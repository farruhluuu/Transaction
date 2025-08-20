import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { TransactionStrategy } from './strategy.interface';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';
import { TransactionStatus } from '../enum/enum.transaction';

@Injectable()
export class OptimisticStrategy implements TransactionStrategy {
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) { }

  private readonly BALANCE_TTL = 60

  async handle({ senderId, receiverId, amount }: CreateTransactionDto) {
    const sender = await this.prisma.user.findUnique({ where: { id: senderId } })
    const receiver = await this.prisma.user.findUnique({ where: { id: receiverId } })

    if (!sender || !receiver) throw new Error('User not found')
    if (sender.balance.lt(amount)) throw new Error('Insufficient funds')

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: senderId, version: sender.version },
        data: {
          balance: { decrement: amount },
          version: { increment: 1 },
        },
      })

      if (updated.count === 0) {
        throw new ConflictException('Sender was modified concurrently')
      }

      await tx.user.update({
        where: { id: receiverId },
        data: { balance: { increment: amount } },
      })

      const txResult = await tx.transaction.create({
        data: { senderId, receiverId, amount, status: TransactionStatus.SUCCESS },
      })

      await this.redis.incrbyfloat(`balance:user:${senderId}`, -amount);
      await this.redis.expire(`balance:user:${senderId}`, this.BALANCE_TTL);

      await this.redis.incrbyfloat(`balance:user:${receiverId}`, amount);
      await this.redis.expire(`balance:user:${receiverId}`, this.BALANCE_TTL);
      
      await this.redis.lpush(`tx:user:${senderId}`, JSON.stringify(txResult))
      await this.redis.ltrim(`tx:user:${senderId}`, 0, 9)

      return txResult
    })
  }
}
