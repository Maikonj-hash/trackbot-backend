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
    return null; // Apenas executa silenciosamente
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as SetVariableStep;

    // Neste simulador MVP, armazenaremos varíaveis simples soltas no redis pra não complexificar o SCHEMA
    const redisKey = `user_vars:${ctx.user.id}:${step.variable}`;

    // Aqui usariamos o redisService se estivesse injetado globalmente
    // Para simplificacao no contexto MVP, logamos. O dev integrará seu Redis ou JsonB na producao
    this.logger.log(
      `[VAR ENGINE] Var: ${step.variable} | Action: ${step.action} | Value: ${step.value}`,
    );

    // Isso permite rotinas de Lead Scoring sem o usuario ver nada (Ex. a pessoa clica em 'Ver Precos' e setamos score +10)

    return step.nextStepId ?? null;
  }
}
