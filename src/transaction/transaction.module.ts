import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { PrismaService } from '../prisma/prisma.service'
import { AtomicStrategy } from './strategy/atomic.transaction';
import { IsolationStrategy } from './strategy/isolation.transaction';
import { OptimisticStrategy } from './strategy/optimistic.transaction';
import { PessimisticStrategy } from './strategy/pessimistic.transaction';
import { TransactionService } from './transaction.service';
import { RedisProvider } from './redis.providers';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    BullModule.forRoot({
      redis: { host: 'localhost', port: 6379 },
    }),
    BullModule.registerQueue({ name: 'transaction-logs' }),
  ],
  controllers: [TransactionController],
  providers: [RedisProvider, PrismaService, AtomicStrategy, IsolationStrategy, OptimisticStrategy, PessimisticStrategy, TransactionService ]
})
export class TransactionModule {}