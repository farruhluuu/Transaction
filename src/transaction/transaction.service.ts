import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OptimisticStrategy } from './stategy/optimistic.transaction';
import { PessimisticStrategy } from './stategy/pessimistic.transaction';
import { AtomicStrategy } from './stategy/atomic.transaction';
import { IsolationStrategy } from './stategy/isolation.transaction';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionStrategyType } from './stategy/transaction-strategy.type';

@Injectable()
export class TransactionService {
  private strategyMap: Record<TransactionStrategyType, any>

  constructor(
    private readonly configService: ConfigService,
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
    }
  }

  async transfer(dto: CreateTransactionDto) {
    const strategyKey = this.configService.get<TransactionStrategyType>('TRANSACTION_STRATEGY')

    const strategy = this.strategyMap[strategyKey]

    if (!strategy) {
      throw new Error(`Unknown strategy: ${strategyKey}`)
    }

    return strategy.handle(dto)
  }
}
