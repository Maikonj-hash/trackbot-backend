import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly prisma: PrismaService) { }

  @Get('dashboard')
  async getDashboardMetrics() {
    // Paraleliza as Promises pro Servidor não engasgar em bancos gigantes
    const [totalUsers, totalInstances, totalMessages] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.whatsappInstance.count(),
      this.prisma.messageHistory.count(),
    ]);

    return {
      status: 'success',
      data: {
        totalUsers, // Ex: Quantidade total de Clientes Identificados
        totalInstances, // Ex: Quantidade de Chips de Clientes rodando
        totalMessages, // Ex: Volume total trafegado no sistema hoje
      },
    };
  }
}
