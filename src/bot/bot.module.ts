import { Module } from '@nestjs/common';
import { StateService } from './state/state.service';
import { FlowService } from './flow/flow.service';
import { VariableService } from './flow/variable.service';
import { BullModule } from '@nestjs/bullmq';
import { TextHandler } from './flow/handlers/text.handler';
import { InputHandler } from './flow/handlers/input.handler';
import { OptionsHandler } from './flow/handlers/options.handler';
import { ConditionHandler } from './flow/handlers/condition.handler';
import { DelayHandler } from './flow/handlers/delay.handler';
import { HandoverHandler } from './flow/handlers/handover.handler';
import { MediaHandler } from './flow/handlers/media.handler';
import { SetVariableHandler } from './flow/handlers/set-variable.handler';
import { HttpRequestHandler } from './flow/handlers/http-request.handler';
import { HandlerFactory } from './flow/handlers/handler.factory';

@Module({
  imports: [BullModule.registerQueue({ name: 'outgoing_messages' })],
  providers: [
    StateService,
    FlowService,
    VariableService,
    TextHandler,
    InputHandler,
    OptionsHandler,
    ConditionHandler,
    DelayHandler,
    HandoverHandler,
    MediaHandler,
    SetVariableHandler,
    HttpRequestHandler,
    HandlerFactory,
  ],
  exports: [FlowService],
})
export class BotModule { }
