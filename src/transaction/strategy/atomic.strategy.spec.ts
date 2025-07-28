import { Test, TestingModule } from '@nestjs/testing';
import { AtomicStrategy } from './atomic.transaction';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';
import { CreateTransactionDto } from '../dto/create-transaction.dto';

describe('AtomicStrategy', () => {
  let strategy: AtomicStrategy;
  let prisma: PrismaService;
  let redis: Redis;

  const mockDto: CreateTransactionDto = {
    senderId: 1,
    receiverId: 2,
    amount: 100,
  };

  const mockSender = {
    id: 1,
    balance: {
      lt: jest.fn().mockReturnValue(false),
      sub: jest.fn().mockReturnValue(900),
    },
  };

  const mockReceiver = {
    id: 2,
    balance: {
      add: jest.fn().mockReturnValue(1100),
    },
  };

  const tx = {
    user: {
      findUnique: jest.fn()
        .mockImplementation(({ where }) => (where.id === 1 ? mockSender : mockReceiver)),
      update: jest.fn(),
    },
    transaction: {
      create: jest.fn().mockResolvedValue({ id: 1, status: 'SUCCESS' }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtomicStrategy,
        {
          provide: PrismaService,
          useValue: {
            $transaction: (cb: any) => cb(tx),
          },
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: {
            set: jest.fn().mockResolvedValue('OK'),
            del: jest.fn(),
            lpush: jest.fn(),
            ltrim: jest.fn(),
          },
        },
      ],
    }).compile();

    strategy = module.get<AtomicStrategy>(AtomicStrategy);
    prisma = module.get<PrismaService>(PrismaService);
    redis = module.get<Redis>('REDIS_CLIENT');
  });

  it('should transfer funds atomically and release lock', async () => {
    const result = await strategy.handle(mockDto);

    expect(redis.set).toHaveBeenCalledWith('key', 'value', 'EX', 60);
    expect(tx.user.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.user.update).toHaveBeenCalledTimes(2);
    expect(tx.transaction.create).toHaveBeenCalled();
    expect(redis.set).toHaveBeenNthCalledWith(2, 'balance:user:1', '900');
    expect(redis.set).toHaveBeenNthCalledWith(3, 'balance:user:2', '1100');
    expect(redis.lpush).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith('lock:user:1');
    expect(result).toEqual({ id: 1, status: 'SUCCESS' });
  });

  it('should throw if lock not acquired', async () => {
    redis.set = jest.fn().mockResolvedValue(null);

    await expect(strategy.handle(mockDto)).rejects.toThrow(
      'Transaction in progress. Please try again.',
    );
  });

  it('should throw if sender has insufficient funds and still release lock', async () => {
    mockSender.balance.lt = jest.fn().mockReturnValue(true);

    await expect(strategy.handle(mockDto)).rejects.toThrow('Insufficient funds');
    expect(redis.del).toHaveBeenCalledWith('lock:user:1');
  });
});
