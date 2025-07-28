import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { Transaction } from '@prisma/client';

export interface TransactionStrategy {
  handle(dto: CreateTransactionDto): Promise<Transaction>
}
