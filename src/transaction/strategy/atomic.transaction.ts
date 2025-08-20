import { Injectable, Inject } from '@nestjs/common';
import { TransactionStrategy } from './strategy.interface';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';
import { TransactionStatus } from '../enum/enum.transaction';

@Injectable()
export class AtomicStrategy implements TransactionStrategy {
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) { }

  private readonly BALANCE_TTL = 60

  async handle(dto: CreateTransactionDto) {
    const { senderId, receiverId, amount } = dto

    const lockKey = `lock:user:${senderId}`
    const lock = await this.redis.set(`key`, 'value', 'EX', 60)

    if (!lock) {
      throw new Error('Transaction in progress. Please try again.')
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const sender = await tx.user.findUnique({ where: { id: senderId } })
        const receiver = await tx.user.findUnique({ where: { id: receiverId } })

        if (!sender || !receiver) throw new Error('User not found')

        if (sender.balance.lt(amount)) {
          throw new Error('Insufficient funds')
        }

        await tx.user.update({
          where: { id: senderId },
          data: { balance: { decrement: amount } },
        })

        await tx.user.update({
          where: { id: receiverId },
          data: { balance: { increment: amount } },
        })

        const txResult = await tx.transaction.create({
          data: { senderId, receiverId, amount, status: TransactionStatus.SUCCESS },
        })
        await this.redis.incrbyfloat(`balance:user:${senderId}`, -amount)
        await this.redis.expire(`balance:user:${senderId}`, this.BALANCE_TTL)

        await this.redis.incrbyfloat(`balance:user:${receiverId}`, amount)
        await this.redis.expire(`balance:user:${receiverId}`, this.BALANCE_TTL)

        await this.redis.lpush(`tx:user:${senderId}`, JSON.stringify(txResult))
        await this.redis.ltrim(`tx:user:${senderId}`, 0, 9)
        return txResult
      })
    } finally {
      await this.redis.del(lockKey)
    }
  }
}
