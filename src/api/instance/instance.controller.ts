import { Controller, Get, Post, Body, Delete, Param } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionManagerService } from '../../whatsapp/session-manager/session-manager.service';

@Controller('instances')
export class InstanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionManager: SessionManagerService,
  ) { }

  @Post()
  async createInstance(@Body() data: { name: string }) {
    const instance = await this.prisma.whatsappInstance.create({
      data: { name: data.name },
    });

    // Dispara criação da conexão, a Engine do Baileys subirá e disparará o QR via Socket
    await this.sessionManager.startSession(instance.id);
    return instance;
  }

  @Get()
  async getInstances() {
    return this.prisma.whatsappInstance.findMany();
  }

  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    const instance = await this.prisma.whatsappInstance.findUnique({
      where: { id },
      select: { status: true },
    });
    return instance || { status: 'NOT_FOUND' };
  }

  @Delete(':id')
  async deleteInstance(@Param('id') id: string) {
    await this.sessionManager.deleteSession(id);
    return { success: true, message: `Instância ${id} totalmente apagada.` };
  }

  @Delete(':id/disconnect')
  async disconnectInstance(@Param('id') id: string) {
    await this.sessionManager.stopSession(id);
    return {
      success: true,
      message: `Instância ${id} desconectada (aguardando novo QR Code).`,
    };
  }

  @Post(':id/connect')
  async connectInstance(@Param('id') id: string) {
    // Força a parada da sessão atual para garantir um novo QR Code caso solicitado
    await this.sessionManager.stopSession(id);
    await this.sessionManager.startSession(id);
    return { success: true, message: `Iniciando tentativa de conexão para ${id}...` };
  }

  @Post(':id/flow')
  async associateFlow(
    @Param('id') id: string,
    @Body() data: { flowId: string | null },
  ) {
    return this.prisma.whatsappInstance.update({
      where: { id },
      data: { flowId: data.flowId },
    });
  }
}
