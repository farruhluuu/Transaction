import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from '../transaction.service';
import { PessimisticStrategy } from './pessimistic.transaction';
import { AtomicStrategy } from './atomic.transaction';
import { OptimisticStrategy } from './optimistic.transaction';
import { IsolationStrategy } from './isolation.transaction';
import { TransactionStrategyType } from './transaction-strategy.type';

jest.setTimeout(20000);

describe('PESSIMISTIC - параллельные переводы (симуляция FOR UPDATE)', () => {
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

    prismaMock.user.findUnique.mockImplementation(({ where }: any) => ({ id: where.id, balance: makeBalance() }));
    prismaMock.user.update.mockImplementation(({ where, data }: any) => {
      if (data.balance?.decrement) {
        const amt = data.balance.decrement;
        if (balance < amt) throw new Error('Insufficient funds');
        balance -= amt;
      }
      if (data.balance?.increment) balance += data.balance.increment;
      return { id: where.id, balance: makeBalance() };
    });
    prismaMock.transaction.create.mockImplementation(({ data }: any) => ({ id: Math.floor(Math.random() * 1e6), ...data }));
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: PessimisticStrategy, useFactory: () => new PessimisticStrategy(prismaMock as any, redisMock as any) },
        { provide: AtomicStrategy, useValue: { handle: jest.fn() } },
        { provide: OptimisticStrategy, useValue: { handle: jest.fn() } },
        { provide: IsolationStrategy, useValue: { handle: jest.fn() } },
        { provide: 'BullQueue_transaction-logs', useValue: { add: mockQueueAdd } },
        { provide: 'REDIS_CLIENT', useValue: redisMock },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
  });

  it('вторая транзакция ждёт завершения первой и итоговый баланс корректен', async () => {
    process.env.TRANSACTION_STRATEGY = TransactionStrategyType.PESSIMISTIC;

    // Симуляция блокировки: $transaction выполняется по очереди
    let locked = false;
    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      while (locked) await new Promise((r) => setTimeout(r, 1));
      locked = true;
      try 
        { return await fn(prismaMock); } 
      finally { locked = false; }
    });

    const dto1 = { senderId: 1, receiverId: 2, amount: 200 };
    const dto2 = { senderId: 1, receiverId: 2, amount: 300 };

    await Promise.all([service.transfer(dto1), service.transfer(dto2)]);

    expect(balance).toBe(500);
    expect(mockQueueAdd).toHaveBeenCalledTimes(2);
  });
});