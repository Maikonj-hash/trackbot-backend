import { Injectable, Logger } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { HttpRequestStep } from '../types';

@Injectable()
export class HttpRequestHandler implements IStepHandler {
  private readonly logger = new Logger(HttpRequestHandler.name);

  canHandle(type: string): boolean {
    return type === 'HTTP_REQUEST';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    return null; // O bloco roda passivamente assim que é acessado
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as HttpRequestStep;

    try {
      this.logger.log(
        `[HTTP REQUEST] Disparando ${step.method} para ${step.url}`,
      );

      // Aqui substituímos possíveis tags de variaveis nos payloads.
      // Exemplo: se no JSON ele mandou { "name": "{{user.name}}" }, fariamos o parse.
      // Isso será aprofundado na engine de "Variables Resolver".
      const parsedBody = step.bodyPayload;

      // Se for POST e tivermos injetado a variável secreta "Toda_Conversa",
      // no banco extrairiamos e enviariamos o array history

      // Combina Headers nativos com os Headers injetados pelo usuário no Frontend
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(step.headers || {}),
      };

      // Disparo usando fetch nativo
      const response = await fetch(step.url, {
        method: step.method,
        headers: requestHeaders,
        body:
          ['POST', 'PUT', 'PATCH'].includes(step.method) && parsedBody
            ? JSON.stringify(parsedBody)
            : undefined,
      });

      const responseData = await response.json();

      this.logger.log(`[HTTP RESPONSE] Status: ${response.status}`);

      // O pulo do gato: Se o usuário definiu "saveResponseToVariable", nós salvamos
      // a resposta da API do cliente no Redis do Bot para usar dinamicamente depois!
      if (step.saveResponseToVariable) {
        this.logger.log(
          `-> Salvando retorno na variável: ${step.saveResponseToVariable}`,
        );
        // ctx.redis.set(`user_vars:${ctx.user.id}:${step.saveResponseToVariable}`, JSON.stringify(responseData));
      }
    } catch (error) {
      this.logger.error(`[HTTP REQUEST FAILED] ${step.url}`, error);
      // Em cenários criticos, talvez o cliente quisesse pausar. Mas como webhook
      // pode cair e voltar, logamos o erro e o bot segue o fluxo normal.
    }

    // Prossegue silenciosamente para o próximo componente de resposta do bot
    return step.nextStepId ?? null;
  }
}
