import { Injectable, Logger } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { ConditionStep } from '../types';

@Injectable()
export class ConditionHandler implements IStepHandler {
  private readonly logger = new Logger(ConditionHandler.name);

  canHandle(type: string): boolean {
    return type === 'CONDITION';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    return null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as ConditionStep;

    const leftValue = ctx.variableService.resolve(`{{${step.variable}}}`, {
      user: ctx.user,
      flowDef: ctx.flowDef,
    });

    const rightValue = step.value;
    let isTrue = false;

    const finalLeftValue = leftValue === `{{${step.variable}}}` ? '' : leftValue;

    switch (step.operator) {
      case 'EQUALS':
        isTrue = String(finalLeftValue) === String(rightValue);
        break;
      case 'NOT_EQUALS':
        isTrue = String(finalLeftValue) !== String(rightValue);
        break;
      case 'IS_EMPTY':
        isTrue = !finalLeftValue || String(finalLeftValue).trim() === '';
        break;
      case 'IS_NOT_EMPTY':
        isTrue = !!finalLeftValue && String(finalLeftValue).trim() !== '';
        break;
      case 'CONTAINS':
        isTrue = String(finalLeftValue)
          .toLowerCase()
          .includes(String(rightValue).toLowerCase());
        break;
    }

    this.logger.log(
      `[CONDITION] ${step.variable} (${finalLeftValue}) ${step.operator} ${rightValue} => ${isTrue}`,
    );
    return isTrue ? step.trueStepId : step.falseStepId;
  }
}
