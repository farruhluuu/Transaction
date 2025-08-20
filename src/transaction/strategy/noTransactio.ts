import { Injectable, Inject } from '@nestjs/common';
import { TransactionStrategy } from './strategy.interface';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';

@Injectable()
export class NoTransactionStrategy implements TransactionStrategy {
  private readonly BALANCE_TTL = 60
  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) { }

  async handle(dto: CreateTransactionDto) {
    const { senderId, receiverId, amount } = dto;

    const sender = await this.prisma.user.findUnique({ where: { id: senderId } })
    const receiver = await this.prisma.user.findUnique({ where: { id: receiverId } })

    if (!sender || !receiver) {
      throw new Error('User not found')
    }

    if (sender.balance.lt(amount)) {
      throw new Error('Insufficient funds')
    }

    await this.prisma.user.update({
      where: { id: senderId },
      data: { balance: { decrement: amount } },
    })

    await this.prisma.user.update({
      where: { id: receiverId },
      data: { balance: { increment: amount } },
    })

    const txResult = await this.prisma.transaction.create({
      data: {
        senderId,
        receiverId,
        amount,
        status: 'SUCCESS',
      },
    });

    await this.redis.incrbyfloat(`balance:user:${senderId}`, -amount)
    await this.redis.expire(`balance:user:${senderId}`, this.BALANCE_TTL)

    await this.redis.incrbyfloat(`balance:user:${receiverId}`, amount)
    await this.redis.expire(`balance:user:${receiverId}`, this.BALANCE_TTL)

    await this.redis.lpush(`tx:user:${senderId}`, JSON.stringify(txResult))
    await this.redis.ltrim(`tx:user:${senderId}`, 0, 9)

    return txResult
  }
}
