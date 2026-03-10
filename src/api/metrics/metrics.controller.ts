import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly prisma: PrismaService) { }

  @Get('dashboard')
  async getDashboardMetrics() {
    const [totalUsers, totalInstances, totalMessages] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.whatsappInstance.count(),
      this.prisma.messageHistory.count(),
    ]);

    return {
      status: 'success',
      data: {
        totalUsers,
        totalInstances,
        totalMessages,
      },
    };
  }
}
