import { Controller, Get, Post, Body, Param, Query, Patch } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('users')
export class UserController {
  constructor(private readonly prisma: PrismaService) { }

  @Get()
  async getAllUsers(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search: string,
    @Query('instanceId') instanceId?: string,
  ) {
    const skip = page ? (parseInt(page) - 1) * parseInt(limit || '20') : 0;
    const take = limit ? parseInt(limit) : 20;

    const where: any = {};

    if (instanceId) {
      where.instanceId = instanceId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as any } },
        { phone: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          instance: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: page ? parseInt(page) : 1,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  @Post()
  async createUser(@Body() data: { phone: string; name?: string }) {
    return this.prisma.user.create({ data });
  }

  @Post(':id') // Suporte a PATCH via POST para compatibilidade se necessário, mas usaremos Patch formal
  async updateUserInfo(@Param('id') id: string, @Body() data: any) {
    return this.updateUser(id, data);
  }

  @Patch(':id')
  async patchUserFormal(@Param('id') id: string, @Body() data: any) {
    return this.updateUser(id, data);
  }

  // Método formal de Update
  async updateUser(id: string, data: { name?: string; metadata?: any }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('User not found');

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;

    if (data.metadata) {
      const currentMetadata = (user.metadata as any) || {};
      updateData.metadata = { ...currentMetadata, ...data.metadata };
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
    });
  }
}
