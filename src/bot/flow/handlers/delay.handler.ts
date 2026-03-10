import { Injectable, Logger } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { DelayStep } from '../types';

@Injectable()
export class DelayHandler implements IStepHandler {
  private readonly logger = new Logger(DelayHandler.name);

  canHandle(type: string): boolean {
    return type === 'DELAY';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    return null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as DelayStep;
    this.logger.log(`[DELAY] Pausando por ${step.durationMs}ms`);

    await new Promise((resolve) => setTimeout(resolve, step.durationMs));

    return step.nextStepId ?? null;
  }
}
