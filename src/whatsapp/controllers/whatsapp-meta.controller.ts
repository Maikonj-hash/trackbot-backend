import { Controller, Get, Post, Req, Res, HttpStatus, Logger, Query, Body } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderFactory } from '../providers/provider.factory';
import { MetaOfficialProvider } from '../providers/meta-official.provider';
import { IncomingMessage } from '../interfaces/message-provider.interface';

@Controller('webhook/meta')
export class WhatsappMetaController {
    private readonly logger = new Logger(WhatsappMetaController.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly providerFactory: ProviderFactory,
    ) { }

    /**
     * Endpoint usado pela Meta para validar a configuração do Webhook (GET)
     * A Meta envia um hub.challenge que precisamos devolver junto com a validação do token (hub.verify_token).
     */
    @Get()
    async verifyWebhook(
        @Query('hub.mode') mode: string,
        @Query('hub.verify_token') token: string,
        @Query('hub.challenge') challenge: string,
        @Res() res: Response,
    ) {
        this.logger.log(`Verificando Webhook Meta. Mode: ${mode}, Token: ${token}`);

        if (mode === 'subscribe' && token) {
            // Procura a primeira instância META que tenha esse token
            // Para cenários com multi-waba, você pode precisar de uma amarração mais complexa,
            // Mas para Webhooks globais ou app único, basta bater com o Token de Verify.
            const instance = await this.prisma.whatsappInstance.findFirst({
                where: { provider: 'META_OFFICIAL', metaVerifyToken: token },
            });

            if (instance) {
                this.logger.log(`Webhook verificado com sucesso para a instância ${instance.name}.`);
                return res.status(HttpStatus.OK).send(challenge);
            } else {
                this.logger.warn(`Verify Token inválido ou não encontrado no banco: ${token}`);
                return res.sendStatus(HttpStatus.FORBIDDEN);
            }
        }
        return res.sendStatus(HttpStatus.BAD_REQUEST);
    }

    /**
     * Endpoint usado pela Meta para POST de novas mensagens (Eventos).
     */
    @Post()
    async receiveWebhook(@Body() body: any, @Res() res: Response) {
        // Regra de ouro da Meta: Sempre retorne 200 OK imediatamente para evitar bloqueios do Webhook.
        // Atrasos de processamento ou erros 500 podem fazer a Meta suspender seu App.
        res.sendStatus(HttpStatus.OK);

        this.logger.log(`[META WEBHOOK] Evento recebido: ${JSON.stringify(body)}`);

        // A meta sempre manda com o payload de formato "whatsapp_business_account"
        if (body?.object === 'whatsapp_business_account' && Array.isArray(body?.entry)) {
            try {
                for (const entry of body.entry) {
                    const wabaId = entry.id; // WhatsApp Business Account ID

                    // Procura instância mapeada pra esse wabaId.
                    const instance = await this.prisma.whatsappInstance.findFirst({
                        where: { provider: 'META_OFFICIAL', metaWabaId: wabaId },
                    });

                    if (!instance) {
                        this.logger.warn(`Nenhuma instância encontrada para WABA ID: ${wabaId}`);
                        continue;
                    }

                    const changes = entry.changes || [];
                    for (const change of changes) {
                        if (change.value && change.value.messages && Array.isArray(change.value.messages)) {
                            // Tem mensagem(ns) rolando
                            const messages = change.value.messages;

                            for (const msg of messages) {
                                const senderPhone = msg.from; // Número do cliente
                                const timestamp = new Date(parseInt(msg.timestamp) * 1000);

                                let textContent = '';
                                if (msg.type === 'text') {
                                    textContent = msg.text?.body || '';
                                } else if (msg.type === 'button') {
                                    // Quick Reply Button click
                                    textContent = msg.button?.text || msg.button?.payload || '';
                                } else if (msg.type === 'interactive') {
                                    if (msg.interactive?.type === 'button_reply') {
                                        textContent = msg.interactive?.button_reply?.id || msg.interactive?.button_reply?.title || '';
                                    } else if (msg.interactive?.type === 'list_reply') {
                                        textContent = msg.interactive?.list_reply?.id || msg.interactive?.list_reply?.title || '';
                                    }
                                }

                                // Se não for suportado ainda, ignora silenciosamente ou salva tipo de mídia
                                if (!textContent && !['image', 'video', 'document', 'audio'].includes(msg.type)) {
                                    this.logger.log(`Tipo de mensagem não suportado extraído: ${msg.type}`);
                                }

                                const incomingMsg: IncomingMessage = {
                                    instanceId: instance.id,
                                    sender: `${senderPhone}@s.whatsapp.net`, // Fake JID mantendo padrão do engine
                                    content: textContent,
                                    fromMe: false, // Vem do cliente
                                    timestamp,
                                    raw: msg, // Guarda tudo para fallback,
                                };

                                // Busca o Provider instanciado para despachar os callbacks do sistema.
                                const provider = await this.providerFactory.getProvider(instance.id);
                                if (provider instanceof MetaOfficialProvider) {
                                    if (provider.onMessageCallback) {
                                        provider.onMessageCallback(incomingMsg);
                                    }
                                }
                            }
                        } else if (change.value && change.value.statuses) {
                            // Status de Lida, Entregue, Enviada (DLR)
                            this.logger.log(`Recebido status (DLR) da Meta. Ignorando no core por enquanto.`);
                        }
                    }
                }
            } catch (error) {
                this.logger.error(`Erro assíncrono ao processar a payload da Meta`, error);
                // Já retornamos 200 lá no topo para a Meta, então não quebramos o contrato do lado deles.
            }
        } else {
            this.logger.warn(`Payload de webhook não é do formato whatsapp_business_account`);
        }
    }
}
