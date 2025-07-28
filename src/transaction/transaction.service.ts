import { Injectable } from '@nestjs/common';
import { OptimisticStrategy } from './strategy/optimistic.transaction';
import { PessimisticStrategy } from './strategy/pessimistic.transaction';
import { AtomicStrategy } from './strategy/atomic.transaction';
import { IsolationStrategy } from './strategy/isolation.transaction';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionStrategyType } from './strategy/transaction-strategy.type';

@Injectable()
export class TransactionService {
  private strategyMap: Record<TransactionStrategyType, any>;

  constructor(
    private readonly optimistic: OptimisticStrategy,
    private readonly pessimistic: PessimisticStrategy,
    private readonly atomic: AtomicStrategy,
    private readonly isolation: IsolationStrategy,
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
    const strategyKey = strategyRaw as TransactionStrategyType;

    const strategy = this.strategyMap[strategyKey];

    if (!strategy) {
      throw new Error(`Unknown strategy in .env: ${strategyKey}`);
    }
    return strategy.handle(dto);
  }
}
