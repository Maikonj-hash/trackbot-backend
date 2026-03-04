import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IncomingMessageWorker } from './workers/incoming-message.worker';
import { OutgoingMessageWorker } from './workers/outgoing-message.worker';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'incoming_messages' },
      {
        name: 'outgoing_messages',
        defaultJobOptions: {
          removeOnComplete: true,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      },
    ),
    forwardRef(() => WhatsappModule),
    forwardRef(() => BotModule),
  ],
  providers: [IncomingMessageWorker, OutgoingMessageWorker],
  exports: [BullModule],
})
export class QueueModule {}
