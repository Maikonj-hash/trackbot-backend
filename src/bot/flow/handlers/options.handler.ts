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
    const optionsKeys = Object.keys(step.options || {});

    if (step.options && step.options[input]) {
      return step.options[input];
    }
    const normalizedInput = input.toLowerCase();
    const caseInsensitiveMatch = optionsKeys.find(k => k.toLowerCase() === normalizedInput);
    if (caseInsensitiveMatch && step.options) {
      return step.options[caseInsensitiveMatch];
    }

    for (const key of optionsKeys) {
      const resolvedKey = ctx.variableService.resolve(key, { user: ctx.user, flowDef: ctx.flowDef });
      if (resolvedKey.toLowerCase() === normalizedInput) {
        return step.options[key];
      }
    }

    const numericIndex = parseInt(input) - 1;
    if (!isNaN(numericIndex) && numericIndex >= 0 && numericIndex < optionsKeys.length) {
      const selectedKey = optionsKeys[numericIndex];
      return step.options[selectedKey];
    }

    const resolvedContent = ctx.variableService.resolve(step.content, {
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

    const resolvedContent = ctx.variableService.resolve(step.content, {
      user: ctx.user,
      flowDef: ctx.flowDef,
    });

    const optionsKeys = Object.keys(step.options || {});
    const optionsCount = optionsKeys.length;

    const textOptions = optionsKeys
      .map((key, i) => `*${i + 1}.* ${ctx.variableService.resolve(key, { user: ctx.user, flowDef: ctx.flowDef })}`)
      .join('\n');

    let interactive: any = undefined;
    let finalContent = resolvedContent;

    const shouldSendNative = step.useNativeButtons && optionsCount > 0 && optionsCount <= 10;

    if (shouldSendNative) {
      if (optionsCount <= 3) {
        interactive = {
          type: 'button',
          buttons: optionsKeys.map((key) => ({
            id: key,
            text: ctx.variableService.resolve(key, { user: ctx.user, flowDef: ctx.flowDef }).substring(0, 20),
          })),
        };
      } else {
        interactive = {
          type: 'list',
          list: {
            buttonText: ctx.variableService.resolve(step.listButtonLabel || 'Selecionar', { user: ctx.user, flowDef: ctx.flowDef }),
            title: ctx.variableService.resolve(step.listTitle || 'Opções', { user: ctx.user, flowDef: ctx.flowDef }),
            footer: ctx.variableService.resolve(step.listFooter || '', { user: ctx.user, flowDef: ctx.flowDef }),
            sections: [
              {
                title: 'Escolha uma opção',
                rows: optionsKeys.map((key) => ({
                  id: key,
                  title: ctx.variableService.resolve(key, { user: ctx.user, flowDef: ctx.flowDef }).substring(0, 24),
                })),
              },
            ],
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
}
