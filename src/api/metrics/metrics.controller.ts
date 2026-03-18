import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('metrics')
@UseGuards(JwtAuthGuard)
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
