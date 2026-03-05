import { Module, forwardRef } from '@nestjs/common';
import { BaileysProvider } from './providers/baileys.provider';
import { SessionManagerService } from './session-manager/session-manager.service';
import { QueueModule } from '../queue/queue.module';
import { GatewayModule } from '../gateway/gateway.module';

import { ProviderFactory } from './providers/provider.factory';
import { MetaOfficialProvider } from './providers/meta-official.provider';
import { WhatsappMetaController } from './controllers/whatsapp-meta.controller';

@Module({
  imports: [forwardRef(() => QueueModule), forwardRef(() => GatewayModule)],
  controllers: [WhatsappMetaController],
  providers: [BaileysProvider, MetaOfficialProvider, ProviderFactory, SessionManagerService],
  exports: [SessionManagerService],
})
export class WhatsappModule { }
