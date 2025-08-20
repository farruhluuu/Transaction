import { Test, TestingModule } from '@nestjs/testing';
import { PessimisticStrategy } from './pessimistic.transaction';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { TransactionStatus } from '../enum/enum.transaction';

const createDecimalMock = (value: number) => ({
  toNumber: jest.fn().mockReturnValue(value),
})

describe('PessimisticStrategy', () => {
  let strategy: PessimisticStrategy
  let redis: jest.Mocked<Redis>

  const mockDto: CreateTransactionDto = {
    senderId: 1,
    receiverId: 2,
    amount: 100,
  };

  const mockSender = { id: 1, balance: createDecimalMock(1000) }
  const mockReceiver = { id: 2, balance: createDecimalMock(1000) }

  const mockPrismaTransaction = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    transaction: {
      create: jest.fn().mockResolvedValue({ id: 'tx-id-1', status: TransactionStatus.SUCCESS }),
    },
  }

  let redisStore: Record<string, string> = {}

  beforeEach(async () => {
    jest.clearAllMocks()
    redisStore = {}

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PessimisticStrategy,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn().mockImplementation(async (callback) => {
              return callback(mockPrismaTransaction)
            }),
          },
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: {
            set: jest.fn((key, value, mode?, duration?) => {
              redisStore[key] = String(value);
              return Promise.resolve('OK');
            }),
            get: jest.fn((key) => Promise.resolve(redisStore[key] ?? null)),
            del: jest.fn((key) => {
              delete redisStore[key];
              return Promise.resolve(1);
            }),
            incrbyfloat: jest.fn((key, amount) => {
              const current = parseFloat(redisStore[key] ?? '0');
              const newVal = current + amount;
              redisStore[key] = String(newVal);
              return Promise.resolve(newVal);
            }),
            expire: jest.fn().mockResolvedValue(1),
            lpush: jest.fn().mockResolvedValue(1),
            ltrim: jest.fn().mockResolvedValue('OK'),
          },
        },
      ],
    }).compile();

    strategy = module.get<PessimisticStrategy>(PessimisticStrategy)
    redis = module.get<jest.Mocked<Redis>>('REDIS_CLIENT')

    mockPrismaTransaction.user.findUnique.mockImplementation(({ where }) => {
      if (where.id === mockDto.senderId) return Promise.resolve(mockSender)
      if (where.id === mockDto.receiverId) return Promise.resolve(mockReceiver)
      return Promise.resolve(null)
    })
  })

  it('should transfer funds and update Redis cache', async () => {
    const result = await strategy.handle(mockDto)

    expect(mockPrismaTransaction.user.findUnique).toHaveBeenCalled()
    expect(mockPrismaTransaction.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: mockDto.senderId } })
    )
    expect(mockPrismaTransaction.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: mockDto.receiverId } })
    )

    expect(result).toEqual({ id: 'tx-id-1', status: 'SUCCESS' })

    expect(await redis.get(`balance:${mockDto.senderId}`)).toBeDefined()
  })

  it('should read balance from Redis instead of DB when available', async () => {
    await redis.set(`balance:${mockDto.senderId}`, '500')

    await strategy.handle(mockDto)

    expect(mockPrismaTransaction.user.findUnique).toHaveBeenCalledWith(
      expect.not.objectContaining({ where: { id: mockDto.senderId } })
    )
  })

  it('should throw if sender not found', async () => {
    mockPrismaTransaction.user.findUnique.mockImplementationOnce(() => Promise.resolve(null))
    await expect(strategy.handle(mockDto)).rejects.toThrow('User not found')
  })

  it('should throw if insufficient funds', async () => {
    const poorSender = { id: 1, balance: createDecimalMock(50) }
    mockPrismaTransaction.user.findUnique.mockImplementationOnce(() => Promise.resolve(poorSender))

    await expect(strategy.handle(mockDto)).rejects.toThrow('Insufficient funds')
    expect(poorSender.balance.toNumber).toHaveBeenCalled()
    expect(mockPrismaTransaction.user.update).not.toHaveBeenCalled()
  })
})
