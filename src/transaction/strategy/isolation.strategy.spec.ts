import { Test, TestingModule } from '@nestjs/testing';
import { IsolationStrategy } from './isolation.transaction';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';
import { transactionConfig } from '../../config/transactionConfig';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { AtomicStrategy } from './atomic.transaction';

jest.mock('./atomic.transaction');

describe('IsolationStrategy', () => {
  let strategy: IsolationStrategy
  let prisma: PrismaService
  let redis: Redis

  const mockDto: CreateTransactionDto = {
    senderId: 1,
    receiverId: 2,
    amount: 100,
  }

  const mockAtomicHandle = jest.fn().mockResolvedValue({ id: 1, status: 'SUCCESS' })

  beforeEach(async () => {
    (AtomicStrategy as jest.Mock).mockImplementation(() => ({
      handle: mockAtomicHandle,
    }))

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IsolationStrategy,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn((cb, options) => cb()), 
          },
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: {},
        },
      ],
    }).compile()

    strategy = module.get<IsolationStrategy>(IsolationStrategy)
    prisma = module.get<PrismaService>(PrismaService)
    redis = module.get<Redis>('REDIS_CLIENT')
  })

  it('should delegate to AtomicStrategy and use correct isolation level', async () => {
    transactionConfig.isolationLevel = 'Repeatable Read'

    const result = await strategy.handle(mockDto)

    expect(mockAtomicHandle).toHaveBeenCalledWith(mockDto)
    expect(result).toEqual({ id: 1, status: 'SUCCESS' })

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    })
  })

  it('should fallback to ReadCommitted for unknown level', async () => {
    transactionConfig.isolationLevel = 'Unknown'

    await strategy.handle(mockDto)

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
    })
  })
})
