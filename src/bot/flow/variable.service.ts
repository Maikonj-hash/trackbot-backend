import { Injectable, Logger } from '@nestjs/common';
import { User } from '@prisma/client';
import { FlowDefinition } from './types';

@Injectable()
export class VariableService {
    private readonly logger = new Logger(VariableService.name);

    /**
     * Resolve placeholders no formato {{key}} dentro de um texto.
     * Suporta:
     * - {{user.field}} ex: {{user.name}}, {{user.phone}}
     * - {{metadata.field}} ex: {{metadata.email}}, {{metadata.orderId}}
     * - {{flow.field}} ex: {{flow.name}}
     */
    resolve(text: string, context: { user: User; flowDef?: FlowDefinition }): string {
        if (!text || !text.includes('{{')) return text;

        return text.replace(/\{\{(.+?)\}\}/g, (match, path) => {
            const value = this.getValueByPath(path.trim(), context);
            return value !== undefined && value !== null ? String(value) : match;
        });
    }

    private getValueByPath(path: string, context: { user: User; flowDef?: FlowDefinition }): any {
        const parts = path.split('.');
        const scope = parts[0];
        const field = parts.slice(1).join('.');

        try {
            if (scope === 'user') {
                if (field.startsWith('metadata.')) {
                    const metaField = field.replace('metadata.', '');
                    const metadata = (context.user as any).metadata || {};
                    return this.getDeepValue(metadata, metaField);
                }
                return (context.user as any)[field];
            }

            // Atalho para metadados direto: {{email}} ou {{metadata.email}}
            if (scope === 'metadata' || parts.length === 1) {
                const metaPath = scope === 'metadata' ? field : path;
                const metadata = (context.user as any).metadata || {};
                return this.getDeepValue(metadata, metaPath);
            }

            if (scope === 'flow' && context.flowDef) {
                return (context.flowDef as any)[field];
            }

            return undefined;
        } catch (e) {
            this.logger.warn(`Error resolving variable path: ${path}`, e);
            return undefined;
        }
    }

    private getDeepValue(obj: any, path: string): any {
        return path.split('.').reduce((prev, curr) => {
            return prev ? prev[curr] : undefined;
        }, obj);
    }
}
