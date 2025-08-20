import { Injectable, Logger } from '@nestjs/common';
import { OptimisticStrategy } from './strategy/optimistic.transaction';
import { PessimisticStrategy } from './strategy/pessimistic.transaction';
import { AtomicStrategy } from './strategy/atomic.transaction';
import { IsolationStrategy } from './strategy/isolation.transaction';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionStrategyType } from './strategy/transaction-strategy.type';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class TransactionService {
  private strategyMap: Record<TransactionStrategyType, any>;
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    private readonly optimistic: OptimisticStrategy,
    private readonly pessimistic: PessimisticStrategy,
    private readonly atomic: AtomicStrategy,
    private readonly isolation: IsolationStrategy,
    @InjectQueue('transaction-logs') private transactionLogQueue: Queue,
  ) {
    this.strategyMap = {
      [TransactionStrategyType.OPTIMISTIC]: this.optimistic,
      [TransactionStrategyType.PESSIMISTIC]: this.pessimistic,
      [TransactionStrategyType.ATOMIC]: this.atomic,
      [TransactionStrategyType.ISOLATION]: this.isolation,
    };
  }

  async transfer(dto: CreateTransactionDto) {
    const strategyRaw = process.env.TRANSACTION_STRATEGY?.trim().toUpperCase();
    if (!strategyRaw) {
      throw new Error('TRANSACTION_STRATEGY env variable is not set');
    }

    const strategyKey = strategyRaw as TransactionStrategyType;
    const strategy = this.strategyMap[strategyKey];

    if (!strategy) {
      throw new Error(`Unknown transaction strategy in .env: ${strategyKey}`);
    }

    this.logger.log(`Executing transfer with strategy: ${strategyKey}`);

    const txResult = await strategy.handle(dto);

    await this.transactionLogQueue.add({
      transactionId: txResult.id,
      senderId: dto.senderId,
      receiverId: dto.receiverId,
      amount: dto.amount,
      status: txResult.status,
      timestamp: new Date(),
    });

    return txResult;
  }
}
