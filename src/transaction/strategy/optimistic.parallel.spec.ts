import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '../transaction.service';
import { OptimisticStrategy } from './optimistic.transaction';
import { AtomicStrategy } from './atomic.transaction';
import { PessimisticStrategy } from './pessimistic.transaction';
import { IsolationStrategy } from './isolation.transaction';
import { TransactionStrategyType } from './transaction-strategy.type';

jest.setTimeout(20000);

describe('OPTIMISTIC - параллельные переводы (конфликт версий)', () => {
  let service: TransactionService;
  let mockQueueAdd: jest.Mock;
  let balance: number;
  let version: number;

  const redisMock = { set: jest.fn(), expire: jest.fn() };
  const prismaMock: any = {
    user: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    transaction: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  const makeBalance = () => ({ toNumber: () => balance, lt: (amt: number) => balance < amt });

  beforeEach(async () => {
    jest.clearAllMocks();
    balance = 1000;
    version = 1;
    mockQueueAdd = jest.fn();

    prismaMock.user.findUnique.mockImplementation(({ where }: any) => ({ id: where.id, balance: makeBalance(), version }));
    prismaMock.user.update.mockImplementation(({ where, data }: any) => {
      if (data.balance?.decrement) {
        const amt = data.balance.decrement;
        if (balance < amt) throw new Error('Insufficient funds');
        balance -= amt;
      }
      return { id: where.id, balance: makeBalance(), version };
    });
    prismaMock.user.updateMany.mockImplementation(({ where, data }: any) => {
      if (where.version === version) {
        if (data.balance?.decrement) {
          const amt = data.balance.decrement;
          if (balance < amt) return { count: 0 };
          balance -= amt;
        }
        if (data.version?.increment) version += data.version.increment;
        return { count: 1 };
      }
      return { count: 0 };
    });
    prismaMock.transaction.create.mockImplementation(({ data }: any) => ({ id: Math.floor(Math.random() * 1e6), ...data }));
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: OptimisticStrategy, useFactory: () => new OptimisticStrategy(prismaMock as any, redisMock as any) },
        { provide: AtomicStrategy, useValue: { handle: jest.fn() } },
        { provide: PessimisticStrategy, useValue: { handle: jest.fn() } },
        { provide: IsolationStrategy, useValue: { handle: jest.fn() } },
        { provide: 'BullQueue_transaction-logs', useValue: { add: mockQueueAdd } },
        { provide: 'REDIS_CLIENT', useValue: redisMock },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
  });

  it('одна из параллельных транзакций откатывается при конфликте версии', async () => {
    process.env.TRANSACTION_STRATEGY = TransactionStrategyType.OPTIMISTIC;

    let first = true;
    prismaMock.user.updateMany.mockImplementation(({ where, data }: any) => {
      if (first) {
        first = false;
        if (data.balance?.decrement) {
          const amt = data.balance.decrement;
          if (balance < amt) return { count: 0 };
          balance -= amt;
        }
        if (data.version?.increment) version += data.version.increment;
        return { count: 1 };
      }
      return { count: 0 };
    });

    const dto1 = { senderId: 1, receiverId: 2, amount: 200 };
    const dto2 = { senderId: 1, receiverId: 2, amount: 300 };

    const results = await Promise.allSettled([service.transfer(dto1), service.transfer(dto2)]);
    const fail = results.filter((r) => r.status === 'rejected');
    const ok = results.filter((r) => r.status === 'fulfilled');

    expect(balance).toBe(800);
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
  });
})