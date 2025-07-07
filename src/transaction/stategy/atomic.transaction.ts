import { Injectable } from '@nestjs/common';
import { TransactionStrategy } from './strategy.interface';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { PrismaService } from 'src/prisma/prisma.service';


@Injectable()
export class AtomicStrategy implements TransactionStrategy {
  constructor(
    private prisma: PrismaService,
  ) { }

  async handle(dto: CreateTransactionDto) {
    const { senderId, receiverId, amount } = dto

    return this.prisma.$transaction(async (tx) => {
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
        data: { senderId, receiverId, amount, status: 'SUCCESS' },
      })

      return txResult
    });
  }
}
