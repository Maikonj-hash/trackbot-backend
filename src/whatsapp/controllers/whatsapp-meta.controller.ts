import { Controller, Get, Post, Req, Res, HttpStatus, Logger, Query, Body, Header } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderFactory } from '../providers/provider.factory';
import { MetaOfficialProvider } from '../providers/meta-official.provider';
import { IncomingMessage } from '../interfaces/message-provider.interface';
import * as crypto from 'crypto';

@Controller('webhook/meta')
export class WhatsappMetaController {
    private readonly logger = new Logger(WhatsappMetaController.name);
    private readonly APP_SECRET = process.env.META_APP_SECRET;

    constructor(
        private readonly prisma: PrismaService,
        private readonly providerFactory: ProviderFactory,
    ) { }

    private validateSignature(req: Request, body: any): boolean {
        if (!this.APP_SECRET) {
            this.logger.warn('META_APP_SECRET não configurado. Pulando validação de assinatura (Inseguro).');
            return true;
        }

        const signature = req.headers['x-hub-signature-256'] as string;
        if (!signature) return false;

        const [algo, hash] = signature.split('=');
        if (algo !== 'sha256') return false;

        const expectedHash = crypto
            .createHmac('sha256', this.APP_SECRET)
            .update(JSON.stringify(body))
            .digest('hex');

        return hash === expectedHash;
    }
    @Get()
    async verifyWebhook(
        @Query('hub.mode') mode: string,
        @Query('hub.verify_token') token: string,
        @Query('hub.challenge') challenge: string,
        @Res() res: Response,
    ) {
        this.logger.log(`Verificando Webhook Meta. Mode: ${mode}, Token: ${token}`);

        if (mode === 'subscribe' && token) {
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

    @Post()
    async receiveWebhook(@Body() body: any, @Req() req: Request, @Res() res: Response) {
        if (!this.validateSignature(req, body)) {
            this.logger.warn('[META WEBHOOK] Assinatura inválida detectada. Ignorando.');
            return res.sendStatus(HttpStatus.OK);
        }

        res.sendStatus(HttpStatus.OK);

        this.logger.log(`[META WEBHOOK] Evento recebido: ${JSON.stringify(body)}`);
        if (body?.object === 'whatsapp_business_account' && Array.isArray(body?.entry)) {
            try {
                for (const entry of body.entry) {
                    const wabaId = entry.id;

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
                            const messages = change.value.messages;
                            const contacts = change.value.contacts || [];

                            for (const msg of messages) {
                                // Extract the real phone number from Meta contacts array mapping
                                let senderPhone = msg.from;
                                const contactData = contacts.find((c: any) => c.wa_id === msg.from);
                                if (contactData && contactData.wa_id) {
                                    senderPhone = contactData.wa_id;
                                }

                                const timestamp = new Date(parseInt(msg.timestamp) * 1000);

                                let textContent = '';
                                if (msg.type === 'text') {
                                    textContent = msg.text?.body || '';
                                } else if (msg.type === 'button') {
                                    textContent = msg.button?.text || msg.button?.payload || '';
                                } else if (msg.type === 'interactive') {
                                    if (msg.interactive?.type === 'button_reply') {
                                        textContent = msg.interactive?.button_reply?.id || msg.interactive?.button_reply?.title || '';
                                    } else if (msg.interactive?.type === 'list_reply') {
                                        textContent = msg.interactive?.list_reply?.id || msg.interactive?.list_reply?.title || '';
                                    }
                                }

                                if (!textContent && !['image', 'video', 'document', 'audio'].includes(msg.type)) {
                                    this.logger.log(`Tipo de mensagem não suportado extraído: ${msg.type}`);
                                }

                                const incomingMsg: IncomingMessage = {
                                    instanceId: instance.id,
                                    sender: `${senderPhone}@s.whatsapp.net`,
                                    content: textContent,
                                    fromMe: false,
                                    timestamp,
                                    raw: msg,
                                };

                                const provider = await this.providerFactory.getProvider(instance.id);
                                if (provider instanceof MetaOfficialProvider) {
                                    if (provider.onMessageCallback) {
                                        provider.onMessageCallback(incomingMsg);
                                    }
                                }
                            }
                        } else if (change.value && change.value.statuses) {
                            this.logger.log(`Recebido status (DLR) da Meta. Ignorando no core por enquanto.`);
                        }
                    }
                }
            } catch (error) {
                this.logger.error(`Erro assíncrono ao processar a payload da Meta`, error);
            }
        } else {
            this.logger.warn(`Payload de webhook não é do formato whatsapp_business_account`);
        }
    }
}
