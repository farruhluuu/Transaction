import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from './transaction.service';
import { OptimisticStrategy } from './strategy/optimistic.transaction';
import { PessimisticStrategy } from './strategy/pessimistic.transaction';
import { AtomicStrategy } from './strategy/atomic.transaction';
import { IsolationStrategy } from './strategy/isolation.transaction';
import { CreateTransactionDto } from './dto/create-transaction.dto';

describe('TransactionService', () => {
  let service: TransactionService;

  const mockDto: CreateTransactionDto = {
    senderId: 1,
    receiverId: 2,
    amount: 100,
  };

  const mockHandle = jest.fn().mockResolvedValue('transaction-success');

  const mockStrategy = {
    handle: mockHandle,
  };

  beforeEach(async () => {
    process.env.TRANSACTION_STRATEGY = 'OPTIMISTIC';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: OptimisticStrategy, useValue: mockStrategy },
        { provide: PessimisticStrategy, useValue: {} },
        { provide: AtomicStrategy, useValue: {} },
        { provide: IsolationStrategy, useValue: {} },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
  });

  it('should use the correct strategy and call handle', async () => {
    const result = await service.transfer(mockDto);

    expect(mockHandle).toHaveBeenCalledWith(mockDto);
    expect(result).toBe('transaction-success');
  });

  it('should throw an error if strategy is unknown', async () => {
    process.env.TRANSACTION_STRATEGY = 'UNKNOWN';

    await expect(service.transfer(mockDto)).rejects.toThrow('Unknown strategy in .env: UNKNOWN',);
  });
});
