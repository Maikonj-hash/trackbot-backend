import { User } from '@prisma/client';
import { IncomingMessage } from '../../../whatsapp/interfaces/message-provider.interface';
import { StateService } from '../../state/state.service';
import { Queue } from 'bullmq';
import { AnyFlowStep } from '../types';

export interface StepHandlerContext {
  msg: IncomingMessage;
  user: User;
  step: AnyFlowStep;
  flowDef: any;
  stateService: StateService;
  outgoingQueue: Queue;
  prisma: any; // PrismaService
}

export interface IStepHandler {
  canHandle(type: string): boolean;

  /**
   * Processa a chegada da mensagem baseada no bloco atual
   * E.g. se o bloco atual era OPTIONS, validamos o input para prosseguir.
   * Retorna o ID do próximo passo, ou null se houver erro (fica parado).
   */
  processInput(ctx: StepHandlerContext): Promise<string | null>;

  /**
   * Dispara as ações do PRÓXIMO bloco recém transicionado.
   * E.g. Acabou de entrar num TEXT, ele dispara o envio da mensagem.
   * Retorna o ID do próximo passo caso seja um bloco passivo (ex: DELAY ou TEXT sem expectInput), null se for pra parar e aguardar input do usuário.
   */
  executeStep(ctx: StepHandlerContext): Promise<string | null>;
}
