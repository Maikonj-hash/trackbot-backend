import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('users')
export class UserController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getAllUsers(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search: string,
  ) {
    const skip = page ? (parseInt(page) - 1) * parseInt(limit || '20') : 0;
    const take = limit ? parseInt(limit) : 20;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as any } },
            { phone: { contains: search } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
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
}
