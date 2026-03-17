import { Injectable, Logger } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { SetVariableStep } from '../types';

@Injectable()
export class SetVariableHandler implements IStepHandler {
  private readonly logger = new Logger(SetVariableHandler.name);

  canHandle(type: string): boolean {
    return type === 'SET_VARIABLE';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    return null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as SetVariableStep;

    const currentMetadata = (ctx.user as any).metadata || {};
    let newValue: any = step.value;

    const varName = step.variable.toLowerCase();

    if (step.action === 'INCREMENT' || step.action === 'DECREMENT') {
      const currentValue = Number(currentMetadata[varName]) || 0;
      const change = Number(step.value) || 0;
      newValue = step.action === 'INCREMENT' ? currentValue + change : currentValue - change;
    }

    const newMetadata = {
      ...currentMetadata,
      [varName]: newValue
    };

    await ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: { metadata: newMetadata },
    });

    (ctx.user as any).metadata = newMetadata;

    await ctx.stateService.pushJourney(ctx.msg.instanceId, ctx.userPhone, {
      type: 'INTERACTION',
      nodeId: step.id,
      nodeType: step.type,
      label: `Set: ${step.variable}`,
      value: String(newValue),
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `[VAR ENGINE] User: ${ctx.user.phone} | Var: ${step.variable} | Action: ${step.action} | New Value: ${newValue}`,
    );

    return step.nextStepId ?? null;
  }
}
