import { Injectable } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';

@Injectable()
export class JumpHandler implements IStepHandler {
  canHandle(type: string): boolean {
    return type === 'JUMP';
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as any; // JumpStep
    return step.targetStepId || null;
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    // Jump nodes don't wait for input
    return null;
  }
}
