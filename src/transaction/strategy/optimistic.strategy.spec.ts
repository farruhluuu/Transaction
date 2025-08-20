import { Test, TestingModule } from '@nestjs/testing';
import { OptimisticStrategy } from './optimistic.transaction';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';
import { ConflictException } from '@nestjs/common';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { TransactionStatus } from '../enum/enum.transaction';

describe('OptimisticStrategy', () => {
  let strategy: OptimisticStrategy
  let prisma: PrismaService
  let redis: Redis

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
    version: 1,
  };

  const mockReceiver = {
    id: 2,
    balance: {
      add: jest.fn().mockReturnValue(1100),
    },
  };

  const tx = {
    user: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    transaction: {
      create: jest.fn().mockResolvedValue({ id: 1, status: TransactionStatus.SUCCESS }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimisticStrategy,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn().mockImplementation(({ where }) =>
                where.id === 1 ? mockSender : mockReceiver,
              ),
            },
            $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
          },
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: {
            incrbyfloat: jest.fn().mockResolvedValue('OK'),
            expire: jest.fn().mockResolvedValue(1),
            lpush: jest.fn().mockResolvedValue(1),
            ltrim: jest.fn().mockResolvedValue('OK'),
          },
        },
      ],
    }).compile();

    strategy = module.get<OptimisticStrategy>(OptimisticStrategy)
    prisma = module.get<PrismaService>(PrismaService)
    redis = module.get<Redis>('REDIS_CLIENT')
  })

  it('should transfer funds successfully', async () => {
    const result = await strategy.handle(mockDto)

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2)
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 1, version: 1 },
      data: {
        balance: { decrement: 100 },
        version: { increment: 1 },
      },
    })
    expect(tx.transaction.create).toHaveBeenCalled()
    expect(redis.incrbyfloat).toHaveBeenCalledWith('balance:user:1', -100)
    expect(redis.expire).toHaveBeenCalledWith('balance:user:1', 60)
    expect(redis.incrbyfloat).toHaveBeenCalledWith('balance:user:2', 100)
    expect(redis.expire).toHaveBeenCalledWith('balance:user:2', 60)
    expect(redis.lpush).toHaveBeenCalled()
    expect(redis.ltrim).toHaveBeenCalled()
    expect(result).toEqual({ id: 1, status: TransactionStatus.SUCCESS })
  })

  it('should throw conflict if sender version mismatch', async () => {
    tx.user.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(strategy.handle(mockDto)).rejects.toThrow(ConflictException)
  })

  it('should throw if sender has insufficient funds', async () => {
    mockSender.balance.lt.mockReturnValueOnce(true)

    await expect(strategy.handle(mockDto)).rejects.toThrow('Insufficient funds')
  })
})