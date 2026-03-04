import { Injectable, Logger } from '@nestjs/common';
import { StateService } from '../state/state.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IncomingMessage } from '../../whatsapp/interfaces/message-provider.interface';
import { HandlerFactory } from './handlers/handler.factory';
import { StepHandlerContext } from './handlers/handler.interface';
import { AnyFlowStep, FlowDefinition } from './types';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FlowService {
  private readonly logger = new Logger(FlowService.name);
  private flows: Map<string, FlowDefinition> = new Map();

  constructor(
    private readonly stateService: StateService,
    private readonly prisma: PrismaService,
    private readonly handlerFactory: HandlerFactory,
    @InjectQueue('outgoing_messages') private readonly outgoingQueue: Queue,
  ) {}

  private getFlow(flowId: string): FlowDefinition {
    if (this.flows.has(flowId)) return this.flows.get(flowId)!;
    try {
      const flowPath = path.join(__dirname, '..', 'flows', `${flowId}.json`);
      const defaultPath = path.join(__dirname, '..', 'flows', 'default.json');
      const targetPath = fs.existsSync(flowPath) ? flowPath : defaultPath;

      const fileContent = fs.readFileSync(targetPath, 'utf8');
      const flowDef = JSON.parse(fileContent) as FlowDefinition;
      this.flows.set(flowId, flowDef);
      return flowDef;
    } catch (e) {
      this.logger.error(`Failed to load flow JSON for ${flowId}`, e);
      return { id: 'error', name: 'Error', steps: {} };
    }
  }

  async processMessage(msg: IncomingMessage) {
    if (!msg.content) return;
    const phone = msg.sender.split('@')[0];

    try {
      let user = await this.prisma.user.findUnique({ where: { phone } });
      if (!user) {
        user = await this.prisma.user.create({ data: { phone } });
      }

      await this.prisma.messageHistory.create({
        data: { userId: user.id, content: msg.content, fromMe: false },
      });

      const instance = await this.prisma.whatsappInstance.findUnique({
        where: { id: msg.instanceId },
      });
      const flowId = instance?.flowId ?? 'default';
      const flowDef = this.getFlow(flowId);

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
        outgoingQueue: this.outgoingQueue,
        prisma: this.prisma,
      };

      if (!currentStepId) {
        const startStepId = user.name ? 'MENU_PRINCIPAL' : 'INITIAL';
        await this.executeStepChain(startStepId, ctx);
        return;
      }

      const currentStep = flowDef.steps[currentStepId];
      if (!currentStep) {
        await this.stateService.clearStep(msg.instanceId, phone);
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

    try {
      while (currentStepId) {
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
