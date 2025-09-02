import { Injectable, Inject } from '@nestjs/common';
import { TransactionStrategy } from './strategy.interface';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';
import { TransactionStatus } from '../enum/enum.transaction';

@Injectable()
export class PessimisticStrategy implements TransactionStrategy {
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) { }

  private readonly BALANCE_TTL = 60

  async handle(dto: CreateTransactionDto) {
    const { senderId, receiverId, amount } = dto
    console.log('pessimistic')

    return this.prisma.$transaction(async (tx) => {
      const sender = await tx.user.findUnique({
        where: { id: senderId },
      })
      const receiver = await tx.user.findUnique({
        where: { id: receiverId },
      })

      if (!sender || !receiver) throw new Error('User not found')

      if (sender.balance.toNumber() < amount) {
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

      const updatedSender = await tx.user.findUnique({ where: { id: senderId } })
      const updatedReceiver = await tx.user.findUnique({ where: { id: receiverId } })

      await this.redis.set(`balance:user:${senderId}`, updatedSender.balance.toString(), 'EX', this.BALANCE_TTL, 'NX')
      await this.redis.set(`balance:user:${receiverId}`, updatedReceiver.balance.toString(), 'EX', this.BALANCE_TTL, 'NX')


      await this.redis.lpush(`tx:user:${senderId}`, JSON.stringify(txResult))
      await this.redis.ltrim(`tx:user:${senderId}`, 0, 9)

      return txResult
    })
  }
}
