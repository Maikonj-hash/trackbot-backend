import { Module } from '@nestjs/common';
import { FlowController } from './flow.controller';
import { FlowService } from './flow.service';
import { PrismaModule } from '../../prisma/prisma.module';

import { BotModule } from '../../bot/bot.module';

@Module({
  imports: [PrismaModule, BotModule],
  controllers: [FlowController],
  providers: [FlowService],
})
export class FlowModule { }
