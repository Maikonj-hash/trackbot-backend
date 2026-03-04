import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FlowService {
  constructor(private readonly prisma: PrismaService) { }

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
    await this.findOne(id); // Ensure exists
    return this.prisma.flow.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Ensure exists
    // O Prisma desconectará/restringirá baseado na relation se necessário
    return this.prisma.flow.delete({
      where: { id },
    });
  }

  // Permitir associar um fluxo específico a um número de WhatsApp específico
  async attachToInstance(flowId: string, instanceId: string) {
    await this.findOne(flowId); // Ensure exists
    return this.prisma.whatsappInstance.update({
      where: { id: instanceId },
      data: { flowId: flowId },
    });
  }

  // Publicar o fluxo: Move o backendFlow do jsonContent para o publishedContent
  async publish(id: string) {
    const flow = await this.findOne(id);
    const json = flow.jsonContent as any;

    if (!json || !json.backendFlow) {
      throw new NotFoundException(
        'Conteúdo de publicação não encontrado no rascunho',
      );
    }

    return this.prisma.flow.update({
      where: { id },
      data: {
        publishedContent: json.backendFlow,
      },
    });
  }
}
