import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { TransactionStrategy } from './strategy.interface';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';

@Injectable()
export class OptimisticStrategy implements TransactionStrategy {
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

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
        data: { senderId, receiverId, amount, status: 'SUCCESS' },
      })

      // 🧠 Обновим Redis-кэш балансов
      await this.redis.set(`balance:user:${senderId}`, sender.balance.sub(amount).toString())
      await this.redis.set(`balance:user:${receiverId}`, receiver.balance.add(amount).toString())

      // 🧠 Кэшируем последние транзакции
      await this.redis.lpush(`tx:user:${senderId}`, JSON.stringify(txResult))
      await this.redis.ltrim(`tx:user:${senderId}`, 0, 9)

      return txResult
    })
  }
}
