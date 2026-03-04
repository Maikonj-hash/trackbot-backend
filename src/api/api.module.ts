import { Module } from '@nestjs/common';
import { UserController } from './user/user.controller';
import { InstanceController } from './instance/instance.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { FlowModule } from './flow/flow.module';
import { MessageModule } from './message/message.module';
import { MetricsController } from './metrics/metrics.controller';

@Module({
  imports: [WhatsappModule, FlowModule, MessageModule],
  controllers: [UserController, InstanceController, MetricsController],
})
export class ApiModule {}
