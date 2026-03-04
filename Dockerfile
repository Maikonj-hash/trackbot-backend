FROM node:18-alpine AS builder

# Instalar openssl para o Prisma no Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Copia as declarações de pacote e dados do Prisma
COPY package*.json ./
COPY prisma ./prisma/

# Instala todas as dependências (includindo devDependencies pro Nest Build)
RUN npm ci

# Copia os arquivos da API
COPY . .

# Gera as tipagens do Prisma para uso interno do alpine
RUN npx prisma generate

# Executa o compilador pro ts >> js
RUN npm run build

# -------------------------
# Container de Produção Limpo
# -------------------------
FROM node:18-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /app

# Copia somente o essencial gerado pelo estágio de 'builder' das linhas acima
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Inicia o container: Primeiro ele dispara qualquer pending migration para o PostgreSQL e então sobe o motor do bot
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
