import { Injectable, Inject } from '@nestjs/common';
import { TransactionStrategy } from './strategy.interface';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';

@Injectable()
export class PessimisticStrategy implements TransactionStrategy {
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async handle(dto: CreateTransactionDto) {
    const { senderId, receiverId, amount } = dto
    console.log('pessimistic')

    return this.prisma.$transaction(async (tx) => {
      const [sender] = await tx.$queryRawUnsafe<any>(
        `SELECT * FROM "User" WHERE id = $1 FOR UPDATE`,
        senderId,
      );
      const [receiver] = await tx.$queryRawUnsafe<any>(
        `SELECT * FROM "User" WHERE id = $1 FOR UPDATE`,
        receiverId,
      );

      if (!sender || !receiver) throw new Error('User not found')
      if (parseFloat(sender.balance) < amount) throw new Error('Insufficient funds')

      await tx.$executeRawUnsafe(
        `UPDATE "User" SET balance = balance - $1 WHERE id = $2`,
        amount,
        senderId,
      )
      await tx.$executeRawUnsafe(
        `UPDATE "User" SET balance = balance + $1 WHERE id = $2`,
        amount,
        receiverId,
      );

      const txResult = await tx.transaction.create({
        data: { senderId, receiverId, amount, status: 'SUCCESS' },
      })

      const newSenderBalance = parseFloat(sender.balance) - amount
      const newReceiverBalance = parseFloat(receiver.balance) + amount

      await this.redis.set(`balance:user:${senderId}`, newSenderBalance.toString())
      await this.redis.set(`balance:user:${receiverId}`, newReceiverBalance.toString())

      await this.redis.lpush(`tx:user:${senderId}`, JSON.stringify(txResult))
      await this.redis.ltrim(`tx:user:${senderId}`, 0, 9)

      return txResult
    });
  }
}
