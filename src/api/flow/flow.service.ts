import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FlowService as BotFlowService } from '../../bot/flow/flow.service';

@Injectable()
export class FlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botFlowService: BotFlowService,
  ) { }

  async create(data: {
    name: string;
    description?: string;
    jsonContent?: any;
  }) {
    return this.prisma.flow.create({
      data: {
        name: data.name,
        description: data.description,
        jsonContent: data.jsonContent || { nodes: [], edges: [] },
      },
    });
  }

  async findAll() {
    return this.prisma.flow.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { instances: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const flow = await this.prisma.flow.findUnique({
      where: { id },
    });
    if (!flow) throw new NotFoundException('Flow not found');
    return flow;
  }

  async update(
    id: string,
    data: { name?: string; description?: string; jsonContent?: any },
  ) {
    await this.findOne(id);
    return this.prisma.flow.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.flow.delete({
      where: { id },
    });
  }

  async attachToInstance(flowId: string, instanceId: string) {
    await this.findOne(flowId);
    return this.prisma.whatsappInstance.update({
      where: { id: instanceId },
      data: { flowId: flowId },
    });
  }

  async publish(id: string) {
    const flow = await this.findOne(id);
    const json = flow.jsonContent as any;

    if (!json || !json.backendFlow) {
      throw new NotFoundException(
        'Conteúdo de backendFlow não encontrado no rascunho.',
      );
    }

    const updated = await this.prisma.flow.update({
      where: { id },
      data: {
        publishedContent: json.backendFlow,
      },
      include: {
        instances: true
      }
    });

    for (const instance of updated.instances) {
      await this.botFlowService.invalidateCache(id, instance.id);
    }

    if (updated.instances.length === 0) {
      await this.botFlowService.invalidateCache(id);
    }

    return updated;
  }

  async duplicate(id: string) {
    const original = await this.findOne(id);
    return this.prisma.flow.create({
      data: {
        name: `${original.name} (Cópia)`,
        description: original.description,
        jsonContent: original.jsonContent || { nodes: [], edges: [] },
        isActive: false, // Começa inativo por segurança
      },
    });
  }

  async toggleActive(id: string) {
    const flow = await this.findOne(id);
    return this.prisma.flow.update({
      where: { id },
      data: { isActive: !flow.isActive },
    });
  }
}
