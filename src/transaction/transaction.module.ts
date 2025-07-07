import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { AtomicStrategy } from './stategy/atomic.transaction';
import { IsolationStrategy } from './stategy/isolation.transaction';
import { OptimisticStrategy } from './stategy/optimistic.transaction';
import { PessimisticStrategy } from './stategy/pessimistic.transaction';

@Module({
  controllers: [TransactionController],
  providers: [ PrismaService, AtomicStrategy, IsolationStrategy, OptimisticStrategy, PessimisticStrategy ]
})
export class TransactionModule {}