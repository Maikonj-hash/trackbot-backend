import { PrismaClient } from '@prisma/client';
import {
  AuthenticationCreds,
  initAuthCreds,
  SignalDataTypeMap,
  BufferJSON,
} from '@whiskeysockets/baileys';

/**
 * Adaptador para salvar a sessão do Baileys diretamente no PostgreSQL via Prisma
 * Evitando uso de MultiFileAuthState que perde sessão quando o container Docker reinicia
 */
export const usePrismaAuthState = async (
  prisma: PrismaClient,
  instanceId: string,
) => {
  const writeData = async (data: any, id: string) => {
    try {
      const dataString = JSON.stringify(data, BufferJSON.replacer);
      await prisma.baileysAuth.upsert({
        where: { id: `${instanceId}-${id}` },
        update: { data: JSON.parse(dataString) },
        create: { id: `${instanceId}-${id}`, data: JSON.parse(dataString) },
      });
    } catch (error) {
      console.error('Error saving baileys auth state', error);
    }
  };

  const readData = async (id: string) => {
    try {
      const auth = await prisma.baileysAuth.findUnique({
        where: { id: `${instanceId}-${id}` },
      });
      if (auth && auth.data) {
        return JSON.parse(JSON.stringify(auth.data), BufferJSON.reviver);
      }
      return null;
    } catch (error) {
      console.error('Error reading baileys auth state', error);
      return null;
    }
  };

  const removeData = async (id: string) => {
    try {
      await prisma.baileysAuth.delete({
        where: { id: `${instanceId}-${id}` },
      });
    } catch (error) {}
  };

  const credsData = await readData('creds');
  const creds: AuthenticationCreds = credsData || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type: keyof SignalDataTypeMap, ids: string[]) => {
          const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = importSyncKey(value);
              }
              data[id] = value;
            }),
          );
          return data;
        },
        set: async (data: any) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => {
      return writeData(creds, 'creds');
    },
  };
};

function importSyncKey(data: any) {
  return data;
}
