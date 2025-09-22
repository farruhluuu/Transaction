import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { TransactionModule } from '../src/transaction/transaction.module';
import { TransactionService } from '../src/transaction/transaction.service';

describe('TransactionController (e2e)', () => {
  let app: INestApplication;
  const transactionService = {
    transfer: jest.fn(),
  };

  const validDto = { senderId: 1, receiverId: 2, amount: 100 };
  const mockResponse = {
    id: 1,
    senderId: 1,
    receiverId: 2,
    amount: 100,
    status: 'SUCCESS',
    createdAt: new Date().toISOString(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TransactionModule],
    })
      .overrideProvider(TransactionService)
      .useValue(transactionService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /transactions/transfer', () => {
    it('успешный перевод', async () => {
      transactionService.transfer.mockResolvedValue(mockResponse);

      const res = await request(app.getHttpServer())
        .post('/transactions/transfer')
        .send(validDto)
        .expect(201);

      expect(res.body).toMatchObject({
        id: 1,
        senderId: 1,
        receiverId: 2,
        amount: 100,
        status: 'SUCCESS',
      });
      expect(transactionService.transfer).toHaveBeenCalledWith(validDto);
    });

    it('ошибка валидации', async () => {
      const invalidDto = { senderId: 1, amount: 100 };

      const res = await request(app.getHttpServer())
        .post('/transactions/transfer')
        .send(invalidDto)
        .expect(400);

      expect(res.body.message).toBeDefined();
    });
  });
});
