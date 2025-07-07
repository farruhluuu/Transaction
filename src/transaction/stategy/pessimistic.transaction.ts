import { Injectable } from '@nestjs/common';
import { TransactionStrategy } from './strategy.interface';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PessimisticStrategy implements TransactionStrategy {
  constructor(
    private prisma: PrismaService,
  ) {}

  async handle(dto: CreateTransactionDto) {
    const { senderId, receiverId, amount } = dto

    return this.prisma.$transaction(async (tx) => {
      const [sender] = await tx.$queryRawUnsafe<any>(`SELECT * FROM "User" WHERE id = $1 FOR UPDATE`, senderId)
      const [receiver] = await tx.$queryRawUnsafe<any>(`SELECT * FROM "User" WHERE id = $1 FOR UPDATE`, receiverId)

      if (!sender || !receiver) throw new Error('User not found')
      if (parseFloat(sender.balance) < amount) throw new Error('Insufficient funds')

      await tx.$executeRawUnsafe(`UPDATE "User" SET balance = balance - $1 WHERE id = $2`, amount, senderId)
      await tx.$executeRawUnsafe(`UPDATE "User" SET balance = balance + $1 WHERE id = $2`, amount, receiverId)

      const txResult = await tx.transaction.create({
        data: { senderId, receiverId, amount, status: 'SUCCESS' },
      })

      return txResult
    });
  }
}
