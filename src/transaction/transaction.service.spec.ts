import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from './transaction.service';
import { OptimisticStrategy } from './strategy/optimistic.transaction';
import { PessimisticStrategy } from './strategy/pessimistic.transaction';
import { AtomicStrategy } from './strategy/atomic.transaction';
import { IsolationStrategy } from './strategy/isolation.transaction';
import { TransactionStrategyType } from './strategy/transaction-strategy.type';

describe('TransactionService', () => {
  let service: TransactionService;
  let mockQueueAdd: jest.Mock;
  const mockStrategy = { handle: jest.fn().mockResolvedValue({ id: 1, status: 'SUCCESS' }) };

  beforeEach(async () => {
    process.env.TRANSACTION_STRATEGY = 'OPTIMISTIC';
    mockQueueAdd = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: OptimisticStrategy, useValue: mockStrategy },
        { provide: PessimisticStrategy, useValue: mockStrategy },
        { provide: AtomicStrategy, useValue: mockStrategy },
        { provide: IsolationStrategy, useValue: mockStrategy },
        {
          provide: 'BullQueue_transaction-logs',
          useValue: {
            add: mockQueueAdd,
          },
        },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
    mockStrategy.handle.mockClear();
    mockQueueAdd.mockClear();
  });

  it('успешно вызывает стратегию и логирует транзакцию', async () => {
    const dto = { senderId: 1, receiverId: 2, amount: 100 };
    const result = await service.transfer(dto);

    expect(mockStrategy.handle).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 1, status: 'SUCCESS' });
    expect(mockQueueAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: 1,
        senderId: 1,
        receiverId: 2,
        amount: 100,
        status: 'SUCCESS',
      }),
    );
  });

  it('выбрасывает ошибку при неизвестной стратегии', async () => {
    process.env.TRANSACTION_STRATEGY = 'UNKNOWN';
    await expect(
      service.transfer({ senderId: 1, receiverId: 2, amount: 100 }),
    ).rejects.toThrow('Unknown transaction strategy in .env: UNKNOWN');
  });

  it('выбрасывает ошибку если переменная окружения не задана', async () => {
    delete process.env.TRANSACTION_STRATEGY;
    await expect(
      service.transfer({ senderId: 1, receiverId: 2, amount: 100 }),
    ).rejects.toThrow('TRANSACTION_STRATEGY env variable is not set');
  });

  it('использует правильную стратегию по типу', async () => {
    for (const type of Object.values(TransactionStrategyType)) {
      process.env.TRANSACTION_STRATEGY = type;
      mockStrategy.handle.mockResolvedValueOnce({ id: 2, status: 'SUCCESS' });
      const dto = { senderId: 3, receiverId: 4, amount: 200 };
      const res = await service.transfer(dto);
      expect(mockStrategy.handle).toHaveBeenLastCalledWith(dto);
      expect(res).toEqual({ id: 2, status: 'SUCCESS' });
    }
  });
});
