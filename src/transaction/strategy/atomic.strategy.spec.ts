import { Test, TestingModule } from '@nestjs/testing';
import { AtomicStrategy } from './atomic.transaction';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { Redis } from 'ioredis';
import { TransactionStatus } from '../enum/enum.transaction';

const createDecimalMock = (value: number) => ({
  toNumber: jest.fn().mockReturnValue(value),
  lt: jest.fn().mockImplementation((amountToCompare) => value < amountToCompare),
});

describe('AtomicStrategy', () => {
  let strategy: AtomicStrategy;
  let redis: jest.Mocked<Redis>;

  const mockDto: CreateTransactionDto = { senderId: 1, receiverId: 2, amount: 100 };

  const mockPrismaTransaction = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      create: jest.fn().mockResolvedValue({ id: 'some-tx-id', status: TransactionStatus.SUCCESS }),
    },
  };
  
  const mockSender = { id: 1, balance: createDecimalMock(1000) }
  const mockReceiver = { id: 2, balance: createDecimalMock(1000) }

  beforeEach(async () => {
    jest.clearAllMocks()
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtomicStrategy,
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
            get: jest.fn().mockResolvedValue('1000'),
            set: jest.fn().mockResolvedValue('OK'),
            del: jest.fn().mockResolvedValue(1),
            incrbyfloat: jest.fn(),
            expire: jest.fn().mockResolvedValue(1),
            lpush: jest.fn().mockResolvedValue(1),
            ltrim: jest.fn().mockResolvedValue('OK'),
          },
        },
      ],
    }).compile()

    strategy = module.get<AtomicStrategy>(AtomicStrategy)
    redis = module.get<jest.Mocked<Redis>>('REDIS_CLIENT')

    mockPrismaTransaction.user.findUnique.mockImplementation(async ({ where }) => {
      if (where.id === mockDto.senderId) return mockSender
      if (where.id === mockDto.receiverId) return mockReceiver
      return null;
    });
  });

  it('should transfer funds atomically and release lock', async () => {
    const result = await strategy.handle(mockDto)

    expect(mockPrismaTransaction.user.findUnique).toHaveBeenCalledTimes(2)
    expect(mockSender.balance.lt).toHaveBeenCalledWith(mockDto.amount)
    expect(mockPrismaTransaction.user.update).toHaveBeenCalled()
    expect(mockPrismaTransaction.transaction.create).toHaveBeenCalled()
    expect(redis.del).toHaveBeenCalledWith(`lock:user:${mockDto.senderId}`)
    expect(result).toEqual({ id: 'some-tx-id', status: 'SUCCESS' })
  })

  it('should throw an error for insufficient funds and still release the lock', async () => {
    const poorSender = { id: 1, balance: createDecimalMock(50) }
    mockPrismaTransaction.user.findUnique.mockImplementationOnce(async () => poorSender)

    await expect(strategy.handle(mockDto)).rejects.toThrow('Insufficient funds')
    
    expect(poorSender.balance.lt).toHaveBeenCalledWith(mockDto.amount)
    
    expect(redis.del).toHaveBeenCalledWith(`lock:user:${mockDto.senderId}`)
  })
})