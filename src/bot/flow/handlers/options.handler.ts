import { Injectable } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { OptionsStep } from '../types';

@Injectable()
export class OptionsHandler implements IStepHandler {
  canHandle(type: string): boolean {
    return type === 'OPTIONS';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as OptionsStep;
    const input = ctx.msg.content.trim();

    const options = await this.loadOptions(ctx, step);
    const optionsKeys = Object.keys(options);

    const normalizedInput = input.toLowerCase();
    const caseInsensitiveMatch = optionsKeys.find(k => k.toLowerCase() === normalizedInput);

    let selectedKey = options[input] ? input : caseInsensitiveMatch;

    if (!selectedKey) {
      const numericIndex = parseInt(input) - 1;
      if (!isNaN(numericIndex) && numericIndex >= 0 && numericIndex < optionsKeys.length) {
        selectedKey = optionsKeys[numericIndex];
      }
    }

    if (selectedKey) {
      const resolvedLabel = await ctx.variableService.resolve(selectedKey, { user: ctx.user, flowDef: ctx.flowDef });
      await ctx.stateService.pushJourney(ctx.msg.instanceId, ctx.userPhone, {
        type: 'INTERACTION',
        nodeId: step.id,
        nodeType: step.type,
        value: resolvedLabel,
        timestamp: new Date().toISOString(),
      });

      return options[selectedKey];
    }

    const resolvedContent = await ctx.variableService.resolve(step.content, {
      user: ctx.user,
      flowDef: ctx.flowDef,
    });

    await ctx.outgoingQueue.add('send', {
      instanceId: ctx.msg.instanceId,
      to: ctx.msg.sender,
      content: '❌ *Opção inválida.*\nEscolha uma das opções abaixo:\n\n' + resolvedContent,
      delayMs: 1000,
    });
    return null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as OptionsStep;

    const options = await this.loadOptions(ctx, step);
    const optionsKeys = Object.keys(options);
    const optionsCount = optionsKeys.length;

    const resolvedContent = await ctx.variableService.resolve(step.content, {
      user: ctx.user,
      flowDef: ctx.flowDef,
    });

    const resolvedOptions = await Promise.all(
      optionsKeys.map(async (key) => ({
        key,
        label: await ctx.variableService.resolve(key, { user: ctx.user, flowDef: ctx.flowDef }),
      }))
    );

    const textOptionsList = resolvedOptions.map((opt, i) => `*${i + 1}.* ${opt.label}`);

    const hasHistory = await ctx.stateService.peekHistory(ctx.msg.instanceId, ctx.userPhone);
    if (hasHistory && step.allowBack) {
      textOptionsList.push('*0.* ↩️ Voltar');
    }

    const textOptions = textOptionsList.join('\n');

    let interactive: any = undefined;
    let finalContent = resolvedContent;

    const totalOptions = (hasHistory && step.allowBack) ? optionsCount + 1 : optionsCount;
    const shouldSendNative = step.useNativeButtons && totalOptions > 0 && totalOptions <= 10;

    if (shouldSendNative) {
      if (totalOptions <= 3) {
        const buttons = resolvedOptions.map((opt) => ({
          id: opt.key,
          text: opt.label.substring(0, 20),
        }));

        if (hasHistory && step.allowBack) {
          buttons.push({ id: '0', text: '↩️ Voltar' });
        }

        interactive = { type: 'button', buttons };
      } else {
        const rows = resolvedOptions.map((opt) => ({
          id: opt.key,
          title: opt.label.substring(0, 24),
        }));

        if (hasHistory && step.allowBack) {
          rows.push({ id: '0', title: '↩️ Voltar' });
        }

        interactive = {
          type: 'list',
          list: {
            buttonText: await ctx.variableService.resolve(step.listButtonLabel || 'Selecionar', { user: ctx.user, flowDef: ctx.flowDef }),
            title: await ctx.variableService.resolve(step.listTitle || 'Opções', { user: ctx.user, flowDef: ctx.flowDef }),
            footer: await ctx.variableService.resolve(step.listFooter || '', { user: ctx.user, flowDef: ctx.flowDef }),
            sections: [{ title: 'Escolha uma opção', rows }],
          },
        };
      }
    } else {
      finalContent = `${resolvedContent}\n\n${textOptions}`;
    }

    await ctx.outgoingQueue.add('send', {
      instanceId: ctx.msg.instanceId,
      to: ctx.msg.sender,
      content: finalContent,
      interactive,
      delayMs: 1500,
    });

    return null;
  }

  private async loadOptions(ctx: StepHandlerContext, step: OptionsStep): Promise<Record<string, string>> {
    const options = { ...(step.options || {}) };
    if (step.dynamicOptionsVariable) {
      const dynamicOptions = await ctx.variableService.get(ctx.user, step.dynamicOptionsVariable.toLowerCase());
      if (dynamicOptions && typeof dynamicOptions === 'object') {
        Object.assign(options, dynamicOptions);
      }
    }
    return options;
  }
}
