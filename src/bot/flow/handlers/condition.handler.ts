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

    const leftValue = await ctx.variableService.get(ctx.user, step.variable, ctx.flowDef);
    const rightValue = (typeof step.value === 'string')
        ? await ctx.variableService.resolve(step.value, { user: ctx.user, flowDef: ctx.flowDef })
        : step.value;
    let isTrue = false;

    const finalLeftValue = leftValue === null || leftValue === undefined ? '' : leftValue;
    const finalRightValue = rightValue === null || rightValue === undefined ? '' : rightValue;

    // Função auxiliar para comparar valores de forma inteligente
    const compare = (left: any, right: any, op: string): boolean => {
      // Se forem objetos, comparamos como JSON
      const l = (typeof left === 'object') ? JSON.stringify(left) : left;
      const r = (typeof right === 'object') ? JSON.stringify(right) : right;

      // Se ambos forem números (ou strings numéricas), comparamos como número
      const lNum = Number(l);
      const rNum = Number(r);
      const isNumeric = !isNaN(lNum) && !isNaN(rNum) && l !== '' && r !== '';

      switch (op) {
        case 'EQUALS':
          return isNumeric ? lNum === rNum : String(l) === String(r);
        case 'NOT_EQUALS':
          return isNumeric ? lNum !== rNum : String(l) !== String(r);
        case 'CONTAINS':
          return String(l).toLowerCase().includes(String(r).toLowerCase());
        case 'IS_EMPTY':
          return !l || String(l).trim() === '';
        case 'IS_NOT_EMPTY':
          return !!l && String(l).trim() !== '';
        default:
          return false;
      }
    };

    isTrue = compare(finalLeftValue, finalRightValue, step.operator);

    this.logger.log(
      `[CONDITION] ${step.variable} (${finalLeftValue}) ${step.operator} ${rightValue} => ${isTrue}`,
    );
    return isTrue ? step.trueStepId : step.falseStepId;
  }
}
