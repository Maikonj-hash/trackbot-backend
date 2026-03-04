import { Injectable, Logger } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { ConditionStep } from '../types';

@Injectable()
export class ConditionHandler implements IStepHandler {
  private readonly logger = new Logger(ConditionHandler.name);

  canHandle(type: string): boolean {
    return type === 'CONDITION';
  }

  // Conditions não aguardam usuário. Eles resolvem e pulam sozinhos.
  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    return null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as ConditionStep;

    // Engine básica de extração de valor (Ex: user.name, user.createdAt)
    let leftValue: any = null;
    if (step.variable.startsWith('user.')) {
      const field = step.variable.split('.')[1];
      leftValue = (ctx.user as any)[field];
    } else {
      // Futuramente meta data (JSONB)
    }

    const rightValue = step.value;
    let isTrue = false;

    switch (step.operator) {
      case 'EQUALS':
        isTrue = String(leftValue) === String(rightValue);
        break;
      case 'NOT_EQUALS':
        isTrue = String(leftValue) !== String(rightValue);
        break;
      case 'IS_EMPTY':
        isTrue = !leftValue || String(leftValue).trim() === '';
        break;
      case 'IS_NOT_EMPTY':
        isTrue = !!leftValue && String(leftValue).trim() !== '';
        break;
      case 'CONTAINS':
        isTrue = String(leftValue)
          .toLowerCase()
          .includes(String(rightValue).toLowerCase());
        break;
    }

    this.logger.log(
      `[CONDITION] ${step.variable} ${step.operator} ${rightValue} => ${isTrue}`,
    );
    return isTrue ? step.trueStepId : step.falseStepId;
  }
}
