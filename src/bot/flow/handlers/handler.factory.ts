import { Injectable } from '@nestjs/common';
import { IStepHandler } from './handler.interface';
import { TextHandler } from './text.handler';
import { InputHandler } from './input.handler';
import { OptionsHandler } from './options.handler';
import { ConditionHandler } from './condition.handler';
import { DelayHandler } from './delay.handler';
import { HandoverHandler } from './handover.handler';
import { MediaHandler } from './media.handler';
import { SetVariableHandler } from './set-variable.handler';
import { HttpRequestHandler } from './http-request.handler';
import { CustomerIdentificationHandler } from './customer-identification.handler';
import { AnyFlowStep } from '../types';
import { SwitchHandler } from './switch.handler';

@Injectable()
export class HandlerFactory {
  private handlers: IStepHandler[] = [];

  constructor(
    private textHandler: TextHandler,
    private optionsHandler: OptionsHandler,
    private inputHandler: InputHandler,
    private conditionHandler: ConditionHandler,
    private httpRequestHandler: HttpRequestHandler,
    private delayHandler: DelayHandler,
    private mediaHandler: MediaHandler,
    private setVariableHandler: SetVariableHandler,
    private handoverHandler: HandoverHandler,
    private customerIdentificationHandler: CustomerIdentificationHandler,
    private switchHandler: SwitchHandler,
  ) {
    this.handlers = [
      this.textHandler,
      this.optionsHandler,
      this.inputHandler,
      this.conditionHandler,
      this.httpRequestHandler,
      this.delayHandler,
      this.mediaHandler,
      this.setVariableHandler,
      this.handoverHandler,
      this.customerIdentificationHandler,
      this.switchHandler,
    ];
  }

  getHandler(type: string): IStepHandler | undefined {
    return this.handlers.find((h) => h.canHandle(type));
  }
}
