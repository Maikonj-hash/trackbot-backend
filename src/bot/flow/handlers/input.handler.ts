import { Injectable } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { InputStep } from '../types';
import { FieldValidatorService } from '../services/field-validator.service';

@Injectable()
export class InputHandler implements IStepHandler {
  constructor(private readonly validator: FieldValidatorService) {}
  canHandle(type: string): boolean {
    return type === 'INPUT';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as InputStep;
    const rawValue = typeof ctx.msg.content === 'string' ? ctx.msg.content.trim() : '';

    // 1. Validation
    const validation = await this.validator.validateAndFormat(rawValue, step.expectedType);

    if (!validation.isValid) {
      const instanceId = ctx.msg.instanceId;
      const userPhone = ctx.userPhone;
      
      const retryKey = `input_retries_${step.id}`;
      const rawRetries = await ctx.stateService.getMetadata(instanceId, userPhone, retryKey);
      let retries = parseInt(rawRetries || '0');
      retries++;

      if (step.maxRetries && retries >= step.maxRetries) {
        // Exceeded retries, clear retry count and advance to avoid infinite loop
        await ctx.stateService.deleteMetadata(instanceId, userPhone, retryKey);
        await ctx.outgoingQueue.add('send', {
          instanceId: ctx.msg.instanceId,
          to: ctx.msg.sender,
          content: '⚠️ _Número máximo de tentativas excedido. Pulando etapa..._',
          delayMs: 500,
        });
        return step.nextStepId ?? null; 
      }

      await ctx.stateService.setMetadata(instanceId, userPhone, retryKey, retries.toString());

      const errorMessage = step.errorMessage || validation.errorMessage || 'Entrada inválida. Tente novamente:';
      
      await ctx.outgoingQueue.add('send', {
        instanceId: ctx.msg.instanceId,
        to: ctx.msg.sender,
        content: `❌ ${errorMessage}`,
        delayMs: 500,
      });

      return step.id; // Lock on this step
    }

    // 2. Clear retries on success
    const retryKey = `input_retries_${step.id}`;
    await ctx.stateService.deleteMetadata(ctx.msg.instanceId, ctx.userPhone, retryKey);

    const valueToSave = validation.value ?? rawValue;

    if (step.saveToVariable === 'name') {
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { name: valueToSave },
      });
    } else if (step.saveToVariable && step.saveToVariable !== 'phone') {
      const currentMetadata = (ctx.user as any).metadata || {};
      const newMetadata = { ...currentMetadata, [step.saveToVariable]: valueToSave };

      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { metadata: newMetadata },
      });
    }

    return step.nextStepId ?? null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as InputStep;

    const content = ctx.variableService.resolve(step.content, {
      user: ctx.user,
      flowDef: ctx.flowDef,
    });

    const hasHistory = await ctx.stateService.peekHistory(ctx.msg.instanceId, ctx.userPhone);
    const footer = (hasHistory && step.allowBack) ? '\n\n_Digite *0* para voltar_' : '';

    await ctx.outgoingQueue.add('send', {
      instanceId: ctx.msg.instanceId,
      to: ctx.msg.sender,
      content: `${content}${footer}`,
      delayMs: 1500,
    });

    return null;
  }
}
