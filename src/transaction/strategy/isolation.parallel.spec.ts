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

  prismaMock.user.findUnique.mockImplementation(({ where }) => {
    console.log('findUnique called with:', where);
    return { id: where.id, balance: makeBalance() };
  });
  prismaMock.user.update.mockImplementation(({ where, data }) => {
    console.log('update called with:', where, data);
    if (data.balance?.decrement) balance -= data.balance.decrement;
    if (data.balance?.increment) balance += data.balance.increment;
    return { id: where.id, balance: makeBalance() };
  });
  prismaMock.transaction.create.mockImplementation(({ data }) => {
    console.log('create transaction called with:', data);
    return { id: Math.floor(Math.random() * 1e6), ...data };
  });

  let isRunning = false;
  const queue: (() => Promise<any>)[] = [];

  prismaMock.$transaction.mockImplementation(async (fn) => {
    return new Promise((resolve, reject) => {
      queue.push(async () => {
        try {
          console.log('Starting transaction');
          const result = await fn(prismaMock);
          console.log('Transaction completed');
          resolve(result);
        } catch (err) {
          console.error('Transaction error:', err);
          reject(err);
        }
      });

      const runNext = async () => {
        if (!isRunning && queue.length > 0) {
          isRunning = true;
          const next = queue.shift()!;
          try {
            await next();
          } finally {
            isRunning = false;
            if (queue.length > 0) {
              await runNext();
            }
          }
        }
      };

      runNext();
    });
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
});

it('при ISOLATION_LEVEL=Serializable транзакции выполняются без аномалий (симуляция последовательного выполнения)', async () => {
  process.env.TRANSACTION_STRATEGY = TransactionStrategyType.ISOLATION;
  process.env.ISOLATION_LEVEL = 'Serializable';

  const dto1 = { senderId: 1, receiverId: 2, amount: 200 };
  const dto2 = { senderId: 1, receiverId: 2, amount: 300 };

  console.time('TransferTest');
  await service.transfer(dto1);
  console.log('First transfer completed');
  await service.transfer(dto2);
  console.log('Second transfer completed');
  console.timeEnd('TransferTest');

  expect(balance).toBe(500);
  expect(mockQueueAdd).toHaveBeenCalledTimes(2);
})})