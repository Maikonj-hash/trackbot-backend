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
import { LeadCaptureHandler } from './lead-capture.handler';
import { AnyFlowStep } from '../types';

@Injectable()
export class HandlerFactory {
  private handlers: IStepHandler[];

  constructor(
    text: TextHandler,
    input: InputHandler,
    options: OptionsHandler,
    condition: ConditionHandler,
    delay: DelayHandler,
    handover: HandoverHandler,
    media: MediaHandler,
    setVariable: SetVariableHandler,
    httpRequest: HttpRequestHandler,
    leadCapture: LeadCaptureHandler,
  ) {
    this.handlers = [
      text,
      input,
      options,
      condition,
      delay,
      handover,
      media,
      setVariable,
      httpRequest,
      leadCapture,
    ];
  }

  getHandler(stepType: AnyFlowStep['type']): IStepHandler | null {
    return this.handlers.find((h) => h.canHandle(stepType)) || null;
  }
}
