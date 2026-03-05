import { Injectable, Logger } from '@nestjs/common';
import { StateService } from '../state/state.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IncomingMessage } from '../../whatsapp/interfaces/message-provider.interface';
import { HandlerFactory } from './handlers/handler.factory';
import { StepHandlerContext } from './handlers/handler.interface';
import { VariableService } from './variable.service';
import { AnyFlowStep, FlowDefinition } from './types';
import * as fs from 'fs';
import * as path from 'path';

const MAX_STEPS_PER_MESSAGE = 20;

@Injectable()
export class FlowService {
  private readonly logger = new Logger(FlowService.name);
  private flows: Map<string, FlowDefinition> = new Map();

  constructor(
    private readonly stateService: StateService,
    private readonly prisma: PrismaService,
    private readonly handlerFactory: HandlerFactory,
    private readonly variableService: VariableService,
    @InjectQueue('outgoing_messages') private readonly outgoingQueue: Queue,
  ) { }

  /**
   * Limpa o cache de um fluxo específico para forçar o recarregamento na próxima mensagem.
   */
  invalidateCache(flowId: string) {
    this.flows.delete(flowId);
    this.logger.log(`Cache invalidated for flow: ${flowId}`);
  }

  private async fetchFlowDefinition(flowId: string): Promise<FlowDefinition> {
    if (this.flows.has(flowId)) return this.flows.get(flowId)!;

    try {
      // 1. Tentar buscar no Banco de Dados (PostgreSQL via Prisma)
      // O flowId pode ser um UUID ou o slug 'default'
      const dbFlow = await this.prisma.flow.findUnique({
        where: { id: flowId },
      });

      if (dbFlow && (dbFlow as any).publishedContent) {
        const json = (dbFlow as any).publishedContent as any;
        // O publishedContent já contém a estrutura FlowDefinition diretamente
        const flowDef = json as FlowDefinition;
        this.flows.set(flowId, flowDef);
        return flowDef;
      }

      // Se não houver conteúdo publicado, vamos para o fallback de arquivos (para compatibilidade com os padrões iniciais)
      const flowPath = path.join(__dirname, '..', 'flows', `${flowId}.json`);
      const defaultPath = path.join(__dirname, '..', 'flows', 'default.json');
      const targetPath = fs.existsSync(flowPath) ? flowPath : defaultPath;

      if (fs.existsSync(targetPath)) {
        const fileContent = fs.readFileSync(targetPath, 'utf8');
        try {
          const flowDef = JSON.parse(fileContent) as FlowDefinition;
          if (flowDef && flowDef.steps) {
            this.flows.set(flowId, flowDef);
            return flowDef;
          }
        } catch (jsonErr) {
          this.logger.error(`Malformed JSON in file: ${targetPath}`, jsonErr);
        }
      }

      return { id: 'error', name: 'Invalid Flow', steps: {} };
    } catch (e) {
      this.logger.error(`Critical failure loading flow for ${flowId}`, e);
      return { id: 'error', name: 'Critical Error', steps: {} };
    }
  }

  async processMessage(msg: IncomingMessage) {
    if (!msg.content) return;
    const phone = msg.sender.split('@')[0];

    try {
      let user = await this.prisma.user.findUnique({ where: { phone } });
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            phone,
            instanceId: msg.instanceId
          }
        });
      }

      await this.prisma.messageHistory.create({
        data: {
          userId: user.id,
          content: msg.content,
          fromMe: false,
          instanceId: msg.instanceId
        },
      });

      const instance = await this.prisma.whatsappInstance.findUnique({
        where: { id: msg.instanceId },
      });

      const flowId = instance?.flowId ?? 'default';
      const flowDef = await this.fetchFlowDefinition(flowId);

      const currentStepId = await this.stateService.getStep(
        msg.instanceId,
        phone,
      );

      const ctx: StepHandlerContext = {
        msg,
        user,
        step: null as any,
        flowDef,
        stateService: this.stateService,
        variableService: this.variableService,
        outgoingQueue: this.outgoingQueue,
        prisma: this.prisma,
      };

      if (!currentStepId) {
        // Se o fluxo tem um firstStepId definido pelo Studio, usa ele.
        // Caso contrário, usa os slugs legados.
        const startStepId = flowDef.firstStepId || (user.name ? 'MENU_PRINCIPAL' : 'INITIAL');
        await this.executeStepChain(startStepId, ctx);
        return;
      }

      const currentStep = flowDef.steps[currentStepId];
      if (!currentStep) {
        this.logger.warn(`Step ${currentStepId} not found in flow ${flowId}. Restarting flow for ${phone}.`);
        await this.stateService.clearStep(msg.instanceId, phone);
        const startStepId = flowDef.firstStepId || (user.name ? 'MENU_PRINCIPAL' : 'INITIAL');
        await this.executeStepChain(startStepId, ctx);
        return;
      }

      ctx.step = currentStep;
      const handler = this.handlerFactory.getHandler(currentStep.type);

      if (!handler) {
        this.logger.error(
          `No handler defined for step type ${currentStep.type}`,
        );
        return;
      }

      const nextStepId = await handler.processInput(ctx);

      if (nextStepId) {
        await this.executeStepChain(nextStepId, ctx);
      }
    } catch (error) {
      this.logger.error(
        `Critical Error during processMessage for ${phone}:`,
        error,
      );
      // Aqui poderíamos engatilhar alguma auto-recuperação ou alertar sistemas observáveis do erro,
      // mas evitamos que a Worker trave inteiramente o fluxo de processamento do app Node.
    }
  }

  /**
   * Executa os blocos recursivamente ou em sequência até bater num bloco
   * "Passivo" (que aguarda o input do humano como INPUT/OPTIONS) ou num END.
   */
  private async executeStepChain(startStepId: string, ctx: StepHandlerContext) {
    let currentStepId: string | null = startStepId;
    let stepsCount = 0;

    try {
      while (currentStepId) {
        if (stepsCount >= MAX_STEPS_PER_MESSAGE) {
          this.logger.warn(`Max steps (${MAX_STEPS_PER_MESSAGE}) reached for ${ctx.user.phone}. Potential loop?`);
          break;
        }
        stepsCount++;

        const step = ctx.flowDef.steps[currentStepId];
        if (!step) {
          await ctx.stateService.clearStep(ctx.msg.instanceId, ctx.user.phone);
          break;
        }

        ctx.step = step;
        await ctx.stateService.setStep(
          ctx.msg.instanceId,
          ctx.user.phone,
          currentStepId,
        );

        const handler = this.handlerFactory.getHandler(step.type);
        if (!handler) break;

        const encadeamentoAutomaticoId = await handler.executeStep(ctx);
        currentStepId = encadeamentoAutomaticoId;
      }
    } catch (error) {
      this.logger.error(
        `Erro crítico executando a cadeia de passos ${currentStepId}:`,
        error,
      );
    }
  }
}
