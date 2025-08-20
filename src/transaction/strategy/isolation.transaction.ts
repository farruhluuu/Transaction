import { Injectable, Inject } from '@nestjs/common';
import { TransactionStrategy } from './strategy.interface';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { Prisma } from '@prisma/client';
import { transactionConfig } from '../../config/transactionConfig';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';
import { AtomicStrategy } from './atomic.transaction';

@Injectable()
export class IsolationStrategy implements TransactionStrategy {
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  private mapIsolation(level: string): Prisma.TransactionIsolationLevel {
    switch (level) {
      case 'Serializable': return 'Serializable'
      case 'Repeatable Read': return 'RepeatableRead'
      case 'Read Committed': return 'ReadCommitted'
      default: return 'ReadCommitted'
    }
  }

  async handle(dto: CreateTransactionDto) {
    const level = this.mapIsolation(transactionConfig.isolationLevel)

    return this.prisma.$transaction(async () => {
      const atomic = new AtomicStrategy(this.prisma, this.redis)
      return atomic.handle(dto)
    }, {
      isolationLevel: level,
    });
  }
}
