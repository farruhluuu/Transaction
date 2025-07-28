import { Test, TestingModule } from '@nestjs/testing';
import { PessimisticStrategy } from './pessimistic.transaction';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';
import { CreateTransactionDto } from '../dto/create-transaction.dto';

describe('PessimisticStrategy', () => {
  let strategy: PessimisticStrategy
  let redis: Redis

  const mockDto: CreateTransactionDto = {
    senderId: 1,
    receiverId: 2,
    amount: 100,
  }

  const mockSender = { id: 1, balance: '1000.00' }
  const mockReceiver = { id: 2, balance: '1000.00' }

  const tx = {
    $queryRawUnsafe: jest
      .fn()
      .mockImplementationOnce(() => [mockSender])
      .mockImplementationOnce(() => [mockReceiver]),
    $executeRawUnsafe: jest.fn(),
    transaction: {
      create: jest.fn().mockResolvedValue({ id: 1, status: 'SUCCESS' }),
    },
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PessimisticStrategy,
        {
          provide: PrismaService,
          useValue: {
            $transaction: (cb: any) => cb(tx),
          },
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: {
            set: jest.fn(),
            lpush: jest.fn(),
            ltrim: jest.fn(),
          },
        },
      ],
    }).compile()

    strategy = module.get<PessimisticStrategy>(PessimisticStrategy)
    redis = module.get<Redis>('REDIS_CLIENT')
  })

  it('should transfer funds with pessimistic locking', async () => {
    const result = await strategy.handle(mockDto)

    expect(tx.$queryRawUnsafe).toHaveBeenNthCalledWith(1, expect.stringContaining('FOR UPDATE'), 1)
    expect(tx.$queryRawUnsafe).toHaveBeenNthCalledWith(2, expect.stringContaining('FOR UPDATE'), 2)

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "User" SET balance = balance - $1'),
      100,
      1,
    )
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "User" SET balance = balance + $1'),
      100,
      2,
    )

    expect(tx.transaction.create).toHaveBeenCalled()

    expect(redis.set).toHaveBeenCalledWith('balance:user:1', '900')
    expect(redis.set).toHaveBeenCalledWith('balance:user:2', '1100')
    expect(redis.lpush).toHaveBeenCalled()
    expect(result).toEqual({ id: 1, status: 'SUCCESS' })
  })

  it('should throw if sender not found', async () => {
    tx.$queryRawUnsafe = jest
      .fn()
      .mockImplementationOnce(() => []) 
      .mockImplementationOnce(() => [mockReceiver])

    await expect(strategy.handle(mockDto)).rejects.toThrow('User not found')
  })

  it('should throw if insufficient funds', async () => {
    tx.$queryRawUnsafe = jest
      .fn()
      .mockImplementationOnce(() => [{ id: 1, balance: '50' }])
      .mockImplementationOnce(() => [mockReceiver])

    await expect(strategy.handle(mockDto)).rejects.toThrow('Insufficient funds')
  })
})