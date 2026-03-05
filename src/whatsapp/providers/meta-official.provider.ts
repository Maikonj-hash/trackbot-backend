import { Injectable, Logger } from '@nestjs/common';
import {
    IMessageProvider,
    IncomingMessage,
} from '../interfaces/message-provider.interface';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Endpoint Oficial da Cloud API da Meta para envio de mensagens
 */
const META_GRAPH_URL = 'https://graph.facebook.com/v20.0';

@Injectable()
export class MetaOfficialProvider implements IMessageProvider {
    private readonly logger = new Logger(MetaOfficialProvider.name);

    // Callbacks globais, assim como no Baileys, repassados para a fila e gateway.
    // IMPORTANTE: Como as msgs chegam via webhook HTTP (passivo), este provider
    // não tem um "socket" escutando, o controller que vai disparar esse callback injetado.
    public onMessageCallback?: (msg: IncomingMessage) => void;
    public onStatusCallback?: (instanceId: string, status: string, qrCode?: string) => void;

    constructor(private readonly prisma: PrismaService) { }

    async connect(instanceId: string): Promise<void> {
        // Para a Meta API, "conectar" é apenas validar se os tokens existem. Não há conexão WebSockets persistente.
        const instance = await this.prisma.whatsappInstance.findUnique({
            where: { id: instanceId },
        });

        if (!instance || instance.provider !== 'META_OFFICIAL') {
            this.logger.error(`A instância ${instanceId} não está configurada para META_OFFICIAL.`);
            return;
        }

        if (!instance.metaToken || !instance.metaPhoneNumberId) {
            this.logger.warn(`Credenciais da Meta incompletas para instância ${instanceId}. Faltam Tokens ou Phone ID.`);
            if (this.onStatusCallback) {
                this.onStatusCallback(instanceId, 'DISCONNECTED');
            }
            return;
        }

        this.logger.log(`[META OFFICIAL] "Conectado" virtualmente na instância ${instanceId} (Credenciais Validadas)`);

        // Atualiza status no banco simulando que está online e pronto
        await this.prisma.whatsappInstance.update({
            where: { id: instanceId },
            data: { status: 'CONNECTED' }
        });

        if (this.onStatusCallback) {
            this.onStatusCallback(instanceId, 'CONNECTED');
        }
    }

    async disconnect(instanceId: string): Promise<void> {
        this.logger.log(`[META OFFICIAL] "Desconectado" virtualmente da instância ${instanceId}`);

        await this.prisma.whatsappInstance.update({
            where: { id: instanceId },
            data: { status: 'DISCONNECTED' }
        });

        if (this.onStatusCallback) {
            this.onStatusCallback(instanceId, 'DISCONNECTED');
        }
    }

    async sendMessage(
        instanceId: string,
        to: string,
        content: string,
        media?: { url: string; type: string; ptt?: boolean },
        interactive?: {
            type: 'button' | 'list';
            buttons?: Array<{ id: string; text: string }>;
            list?: { buttonText: string; title?: string; footer?: string; sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> };
        },
    ): Promise<any> {
        const instance = await this.prisma.whatsappInstance.findUnique({ where: { id: instanceId } });
        if (!instance || !instance.metaToken || !instance.metaPhoneNumberId) {
            this.logger.error(`Não é possível enviar mensagem META_OFFICIAL para ${instanceId}. Configuração ausente.`);
            return null;
        }

        const cleanTo = to.replace(/[^0-9]/g, ''); // Cloud API prefere DDI+DDD+Numero limpo

        const payload: any = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanTo,
        };

        if (interactive && interactive.type === 'button') {
            payload.type = "interactive";
            payload.interactive = {
                type: "button",
                body: { text: content },
                action: {
                    buttons: interactive.buttons?.map(b => ({
                        type: "reply",
                        reply: { id: b.id.substring(0, 256), title: b.text.substring(0, 20) }
                    })) || []
                }
            };
        } else if (interactive && interactive.type === 'list') {
            payload.type = "interactive";
            payload.interactive = {
                type: "list",
                header: interactive.list?.title ? { type: "text", text: interactive.list.title.substring(0, 60) } : undefined,
                body: { text: content.substring(0, 1024) },
                footer: interactive.list?.footer ? { text: interactive.list.footer.substring(0, 60) } : undefined,
                action: {
                    button: interactive.list?.buttonText?.substring(0, 20) || "Opções",
                    sections: interactive.list?.sections?.map(s => ({
                        title: s.title.substring(0, 24),
                        rows: s.rows.map(r => ({
                            id: r.id.substring(0, 200),
                            title: r.title.substring(0, 24),
                            description: r.description?.substring(0, 72)
                        }))
                    })) || []
                }
            };
        } else if (media) {
            let mediaTypeObj = "image";
            if (media.type.includes('video')) mediaTypeObj = "video";
            else if (media.type.includes('audio')) mediaTypeObj = "audio";
            else if (media.type.includes('document') || media.type.includes('pdf')) mediaTypeObj = "document";

            payload.type = mediaTypeObj;
            payload[mediaTypeObj] = { link: media.url };
            if (content) {
                payload[mediaTypeObj].caption = content;
            }
        } else {
            payload.type = "text";
            payload.text = { preview_url: false, body: content };
        }

        try {
            this.logger.log(`[META OFFICIAL] Disparando requisição para ${cleanTo}...`);
            const response = await fetch(`${META_GRAPH_URL}/${instance.metaPhoneNumberId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${instance.metaToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                this.logger.error(`[META OFFICIAL ERROR] Falha ao enviar para ${cleanTo}: ${JSON.stringify(errData)}`);
                return null;
            }

            const data = await response.json();
            this.logger.log(`[META OFFICIAL] Mensagem entregue. ID: ${data?.messages?.[0]?.id}`);
            return data;
        } catch (error) {
            this.logger.error(`[CRÍTICO] Falha ao comunicar com Graph API da Meta para ${cleanTo}:`, error);
            return null;
        }
    }

    onMessage(callback: (msg: IncomingMessage) => void): void {
        this.onMessageCallback = callback;
    }

    onConnectionStatus(callback: (instanceId: string, status: string, qrCode?: string) => void): void {
        this.onStatusCallback = callback;
    }
}
