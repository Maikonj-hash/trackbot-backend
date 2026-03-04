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

    // 1. Tenta Match Direto (Texto ou ID do Botão)
    if (step.options && step.options[input]) {
      return step.options[input];
    }

    // 1.1 Tenta Match Insensível (Case-Insensitive)
    const normalizedInput = input.toLowerCase();
    const caseInsensitiveMatch = optionsKeys.find(k => k.toLowerCase() === normalizedInput);
    if (caseInsensitiveMatch && step.options) {
      return step.options[caseInsensitiveMatch];
    }

    // 1.2 Tenta Match Dinâmico (Se a opção tiver variáveis ex: {{user.name}})
    for (const key of optionsKeys) {
      const resolvedKey = ctx.variableService.resolve(key, { user: ctx.user, flowDef: ctx.flowDef });
      if (resolvedKey.toLowerCase() === normalizedInput) {
        return step.options[key];
      }
    }

    // 2. Tenta Match Numérico (Failsafe para quem digita "1", "2")
    const numericIndex = parseInt(input) - 1;
    if (!isNaN(numericIndex) && numericIndex >= 0 && numericIndex < optionsKeys.length) {
      const selectedKey = optionsKeys[numericIndex];
      return step.options[selectedKey];
    }

    // 3. Se nada funcionar, repete a pergunta com erro
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

    let interactive: any = undefined;

    if (step.useNativeButtons && optionsCount > 0) {
      if (optionsCount <= 3) {
        // Modo Botão (WhatsApp aceita até 3)
        interactive = {
          type: 'button',
          buttons: optionsKeys.map((key) => ({
            id: key,
            text: ctx.variableService.resolve(key, { user: ctx.user, flowDef: ctx.flowDef }),
          })),
        };
      } else if (optionsCount <= 10) {
        // Modo Lista (Até 10 opções por seção)
        interactive = {
          type: 'list',
          list: {
            buttonText: ctx.variableService.resolve(step.listButtonLabel || 'Selecionar', { user: ctx.user, flowDef: ctx.flowDef }),
            title: ctx.variableService.resolve(step.listTitle || '', { user: ctx.user, flowDef: ctx.flowDef }),
            footer: ctx.variableService.resolve(step.listFooter || '', { user: ctx.user, flowDef: ctx.flowDef }),
            sections: [
              {
                title: 'Opções',
                rows: optionsKeys.map((key) => ({
                  id: key,
                  title: ctx.variableService.resolve(key, { user: ctx.user, flowDef: ctx.flowDef }),
                })),
              },
            ],
          },
        };
      }
    }

    await ctx.outgoingQueue.add('send', {
      instanceId: ctx.msg.instanceId,
      to: ctx.msg.sender,
      content: resolvedContent,
      interactive,
      delayMs: 1500,
    });

    // O Options SEMPRE para aqui aguardando o usuário clicar ou digitar.
    return null;
  }
}
