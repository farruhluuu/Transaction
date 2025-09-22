import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '../transaction.service';
import { IsolationStrategy } from './isolation.transaction';
import { AtomicStrategy } from './atomic.transaction';
import { OptimisticStrategy } from './optimistic.transaction';
import { PessimisticStrategy } from './pessimistic.transaction';
import { TransactionStrategyType } from './transaction-strategy.type';

jest.setTimeout(30000);

describe('ISOLATION (Serializable) - параллельные переводы', () => {
  let service: TransactionService;
  let mockQueueAdd: jest.Mock;
  let balance: number;

  const redisMock = { set: jest.fn(), expire: jest.fn() };
  const prismaMock: any = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    transaction: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  const makeBalance = () => ({ toNumber: () => balance, lt: (amt: number) => balance < amt });

  beforeEach(async () => {
    jest.clearAllMocks();
    balance = 1000;
    mockQueueAdd = jest.fn();

    prismaMock.user.findUnique.mockImplementation(({ where }) => ({ id: where.id, balance: makeBalance() }));
    prismaMock.user.update.mockImplementation(({ where, data }) => {
      if (data.balance?.decrement) balance -= data.balance.decrement;
      if (data.balance?.increment) balance += data.balance.increment;
      return { id: where.id, balance: makeBalance() };
    });
    prismaMock.transaction.create.mockImplementation(({ data }) => ({ id: Math.floor(Math.random() * 1e6), ...data }));

    // Симуляция последовательного выполнения транзакций (Serializable)
    let running = false;
    prismaMock.$transaction.mockImplementation(async (fn: any, opts?: any) => {
      if (opts?.isolationLevel === 'Serializable') {
        while (running) await new Promise((r) => setTimeout(r, 1));
        running = true;
        try { return await fn(prismaMock); } finally { running = false; }
      }
      return fn(prismaMock, opts);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: IsolationStrategy, useFactory: () => new IsolationStrategy(prismaMock as any, redisMock as any) },
        { provide: AtomicStrategy, useValue: { handle: jest.fn() } },
        { provide: OptimisticStrategy, useValue: { handle: jest.fn() } },
        { provide: PessimisticStrategy, useValue: { handle: jest.fn() } },
        { provide: 'BullQueue_transaction-logs', useValue: { add: mockQueueAdd } },
        { provide: 'REDIS_CLIENT', useValue: redisMock },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
  })

  it('при ISOLATION_LEVEL=Serializable транзакции выполняются без аномалий (симуляция последовательного выполнения)', async () => {
    process.env.TRANSACTION_STRATEGY = TransactionStrategyType.ISOLATION;
    process.env.ISOLATION_LEVEL = 'Serializable';

    const dto1 = { senderId: 1, receiverId: 2, amount: 200 };
    const dto2 = { senderId: 1, receiverId: 2, amount: 300 };

    await Promise.all([service.transfer(dto1), service.transfer(dto2)]);

    expect(balance).toBe(500);
    expect(mockQueueAdd).toHaveBeenCalledTimes(2);
  });
});