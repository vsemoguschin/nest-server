# Используем многоступенчатую сборку для оптимизации
# Этап 1: Сборка приложения
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

# Этап 2: Финальный образ
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/.env ./
RUN npm ci --production
RUN apk add --no-cache bash
EXPOSE 5000
CMD ["node", "dist/main.js"]