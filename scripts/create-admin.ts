import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || 'Admin';

  if (!email || !password) {
    console.error('Uso: npx ts-node scripts/create-admin.ts <email> <senha> <nome?>');
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const admin = await prisma.admin.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'ADMIN',
      },
    });

    console.log(`Administrador criado com sucesso: ${admin.email}`);
  } catch (error) {
    console.error('Erro ao criar administrador:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
