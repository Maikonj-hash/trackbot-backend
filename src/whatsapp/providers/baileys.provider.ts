import { Injectable, Logger } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import {
  IMessageProvider,
  IncomingMessage,
} from '../interfaces/message-provider.interface';
import { PrismaService } from '../../prisma/prisma.service';
import pino from 'pino';
import * as path from 'path';
import * as fs from 'fs';
import * as qrcodeTerminal from 'qrcode-terminal';
import { JidHelper } from '../helpers/jid.helper';

@Injectable()
export class BaileysProvider implements IMessageProvider {
  private sockets: Map<string, ReturnType<typeof makeWASocket>> = new Map();
  private readonly logger = new Logger(BaileysProvider.name);

  constructor(private prisma: PrismaService) { }

  private messageCallback: (msg: IncomingMessage) => void;
  private statusCallback: (
    instanceId: string,
    status: string,
    qrCode?: string,
  ) => void;

  onMessage(callback: (msg: IncomingMessage) => void): void {
    this.messageCallback = callback;
  }

  onConnectionStatus(
    callback: (instanceId: string, status: string, qrCode?: string) => void,
  ): void {
    this.statusCallback = callback;
  }

  async connect(instanceId: string): Promise<void> {
    // [BLINDAGEM] Previnindo Duplicação: Se já existe um socket, não precisamos travar o fluxo, 
    // mas o ideal é que o Controller gerencie o stop/start.
    if (this.sockets.has(instanceId)) {
      this.logger.log(`Refazendo conexão para ${instanceId} para renovação de QR...`);
    }

    // Salvamento na pasta temporária do projeto
    const sessionPath = path.join(process.cwd(), '.sessions', instanceId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    this.logger.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
      version,
      auth: state as any,
      logger: pino({ level: 'silent' }) as any,
      syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrcodeTerminal.generate(qr, { small: true });
        this.statusCallback?.(instanceId, 'QR_READY', qr);
        this.updateInstanceDbStatus(instanceId, 'QR_READY');
      }

      if (connection === 'connecting') {
        this.logger.log(`Instância ${instanceId} está pareando/conectando...`);
        this.statusCallback?.(instanceId, 'CONNECTING');
        this.updateInstanceDbStatus(instanceId, 'CONNECTING');
      }

      if (connection === 'close') {
        const error = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = error !== DisconnectReason.loggedOut;
        this.logger.warn(
          `Session ${instanceId} closed, reconnecting: ${shouldReconnect}`,
        );

        this.statusCallback?.(instanceId, 'DISCONNECTED');
        this.updateInstanceDbStatus(instanceId, 'DISCONNECTED');

        if (shouldReconnect) {
          setTimeout(() => this.connect(instanceId), 5000);
        }
      } else if (connection === 'open') {
        const userId = sock.user?.id;
        const phone = userId ? userId.split(':')[0].split('@')[0] : null;

        this.logger.log(
          `Session ${instanceId} connected successfully. User: ${phone}`,
        );

        this.statusCallback?.(instanceId, 'CONNECTED');
        this.updateInstanceDbStatus(instanceId, 'CONNECTED', phone);
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type === 'notify') {
        for (const msg of m.messages) {
          if (!msg.message || msg.key.remoteJid === 'status@broadcast')
            continue;

          const sender = msg.key.remoteJid || '';
          const content =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.buttonsResponseMessage?.selectedButtonId ||
            msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
            msg.message.templateButtonReplyMessage?.selectedId ||
            '';

          if (this.messageCallback && content) {
            this.messageCallback({
              instanceId,
              sender,
              content,
              fromMe: !!msg.key.fromMe,
              timestamp: new Date((msg.messageTimestamp as number) * 1000),
              raw: msg,
            });
          }
        }
      }
    });

    this.sockets.set(instanceId, sock);
  }

  async disconnect(instanceId: string): Promise<void> {
    const sock = this.sockets.get(instanceId);
    if (sock) {
      this.logger.log(
        `Encerando sessão e apagando chaves da instância ${instanceId}...`,
      );
      await sock.logout().catch(() => {
        this.logger.warn(`Falha suave no logout para ${instanceId}`);
      });
      this.sockets.delete(instanceId);
      await this.updateInstanceDbStatus(instanceId, 'DISCONNECTED');
    }

    // [BLINDAGEM] Failsafe: Garantindo que as chaves/cache sejam destruídas do disco caso o Baileys deixe lixo.
    const sessionPath = path.join(process.cwd(), '.sessions', instanceId);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      this.logger.log(
        `Cache local da instância ${instanceId} destruído forçadamente.`,
      );
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
      list?: {
        buttonText: string;
        title?: string;
        footer?: string;
        sections: Array<{
          title: string;
          rows: Array<{ id: string; title: string; description?: string }>;
        }>;
      };
    },
  ): Promise<any> {
    const sock = this.sockets.get(instanceId);
    if (!sock) throw new Error(`Socket not found for instance ${instanceId}`);

    const jid = JidHelper.formatJid(to);

    // 1. Envio de Mídia
    if (media) {
      if (media.type === 'audio') {
        return sock.sendMessage(jid, {
          audio: { url: media.url },
          mimetype: 'audio/mp4',
          ptt: media.ptt,
        });
      }
      if (media.type === 'image') {
        return sock.sendMessage(jid, {
          image: { url: media.url },
          caption: content,
        });
      }
      if (media.type === 'video') {
        return sock.sendMessage(jid, {
          video: { url: media.url },
          caption: content,
        });
      }
      if (media.type === 'document') {
        return sock.sendMessage(jid, {
          document: { url: media.url },
          mimetype: 'application/pdf',
          caption: content,
          fileName: 'Documento',
        });
      }
    }

    // 2. Envio Interativo (Botões ou Listas)
    if (interactive) {
      if (interactive.type === 'button' && interactive.buttons) {
        return sock.sendMessage(jid, {
          text: content,
          buttons: interactive.buttons.map((b) => ({
            buttonId: b.id,
            buttonText: { displayText: b.text },
            type: 1,
          })),
          headerType: 1,
        } as any);
      }

      if (interactive.type === 'list' && interactive.list) {
        return sock.sendMessage(jid, {
          text: content,
          title: interactive.list.title,
          footer: interactive.list.footer,
          buttonText: interactive.list.buttonText,
          sections: interactive.list.sections.map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({
              title: r.title,
              rowId: r.id,
              description: r.description,
            })),
          })),
        } as any);
      }
    }

    // 3. Texto Plano (Default)
    try {
      return await sock.sendMessage(jid, { text: content });
    } catch (error) {
      this.logger.error(
        `Failed to send message to ${jid} on instance ${instanceId}`,
        error,
      );
      throw error;
    }
  }

  private async updateInstanceDbStatus(
    instanceId: string,
    status: string,
    phone?: string | null,
  ) {
    try {
      this.logger.log(`Atualizando status no DB: ${instanceId} -> ${status}`);
      await this.prisma.whatsappInstance.update({
        where: { id: instanceId },
        data: {
          status,
          ...(phone ? { phone } : {}),
        },
      });
    } catch (err) {
      this.logger.error(`Failed to update DB status for ${instanceId}: ${err.message}`);
    }
  }
}
