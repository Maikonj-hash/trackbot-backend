import { Module } from '@nestjs/common';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { WhatsappModule } from '../../whatsapp/whatsapp.module';

@Module({
  imports: [PrismaModule, WhatsappModule],
  controllers: [MessageController],
  providers: [MessageService],
})
export class MessageModule {}
