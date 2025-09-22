import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { TransactionModule } from '../src/transaction/transaction.module';
import { TransactionService } from '../src/transaction/transaction.service';

describe('TransactionController (e2e)', () => {
  let app: INestApplication;
  let transactionService = {
    transfer: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TransactionModule],
    })
      .overrideProvider(TransactionService)
      .useValue(transactionService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /transactions/transfer — успешный перевод', async () => {
    transactionService.transfer.mockResolvedValue({
      id: 1,
      senderId: 1,
      receiverId: 2,
      amount: 100,
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
    });

    const dto = { senderId: 1, receiverId: 2, amount: 100 };

    const res = await request(app.getHttpServer())
      .post('/transactions/transfer')
      .send(dto)
      .expect(201);

    expect(res.body).toMatchObject({
      id: 1,
      senderId: 1,
      receiverId: 2,
      amount: 100,
      status: 'SUCCESS',
    });
    expect(transactionService.transfer).toHaveBeenCalledWith(dto);
  });

  it('POST /transactions/transfer — ошибка валидации', async () => {
    const dto = { senderId: 1, amount: 100 }

    const res = await request(app.getHttpServer())
      .post('/transactions/transfer')
      .send(dto)
      .expect(400);

    expect(res.body.message).toBeDefined();
  });
});