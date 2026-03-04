import { Module, forwardRef } from '@nestjs/common';
import { BaileysProvider } from './providers/baileys.provider';
import { SessionManagerService } from './session-manager/session-manager.service';
import { QueueModule } from '../queue/queue.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [forwardRef(() => QueueModule), forwardRef(() => GatewayModule)],
  providers: [BaileysProvider, SessionManagerService],
  exports: [SessionManagerService],
})
export class WhatsappModule {}
