import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisProvider } from 'src/transaction/redis.providers';

@Module({
  controllers: [UserController],
  providers: [RedisProvider, UserService, PrismaService],
})
export class UserModule {}
