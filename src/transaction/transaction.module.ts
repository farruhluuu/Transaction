import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { AtomicStrategy } from './strategy/atomic.transaction';
import { IsolationStrategy } from './strategy/isolation.transaction';
import { OptimisticStrategy } from './strategy/optimistic.transaction';
import { PessimisticStrategy } from './strategy/pessimistic.transaction';
import { TransactionService } from './transaction.service';
import { RedisProvider } from './redis.providers';

@Module({
  controllers: [TransactionController],
  providers: [RedisProvider, PrismaService, AtomicStrategy, IsolationStrategy, OptimisticStrategy, PessimisticStrategy, TransactionService ]
})
export class TransactionModule {}