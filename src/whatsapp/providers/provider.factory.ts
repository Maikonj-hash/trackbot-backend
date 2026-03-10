import { Injectable, Logger } from '@nestjs/common';
import { IMessageProvider } from '../interfaces/message-provider.interface';
import { BaileysProvider } from './baileys.provider';
import { MetaOfficialProvider } from './meta-official.provider';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProviderFactory {
    private readonly logger = new Logger(ProviderFactory.name);

    private activeProviders: Map<string, IMessageProvider> = new Map();

    constructor(
        private readonly prisma: PrismaService,
        private readonly baileysProvider: BaileysProvider,
        private readonly metaProvider: MetaOfficialProvider,
    ) { }

    async getProvider(instanceId: string): Promise<IMessageProvider> {
        if (this.activeProviders.has(instanceId)) {
            return this.activeProviders.get(instanceId)!;
        }

        const instance = await this.prisma.whatsappInstance.findUnique({
            where: { id: instanceId },
        });

        if (!instance) {
            throw new Error(`Instância ${instanceId} não encontrada no banco.`);
        }

        let provider: IMessageProvider;

        if (instance.provider === 'META_OFFICIAL') {
            this.logger.log(`Resolvendo Provider: [META_OFFICIAL] para instância ${instanceId}`);
            provider = this.metaProvider;
        } else {
            this.logger.log(`Resolvendo Provider: [BAILEYS] para instância ${instanceId}`);
            provider = this.baileysProvider;
        }

        this.activeProviders.set(instanceId, provider);
        return provider;
    }

    removeProvider(instanceId: string) {
        this.activeProviders.delete(instanceId);
    }
}
