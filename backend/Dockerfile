FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 4000
USER node

# Aplica el esquema (idempotente) y luego arranca la API.
CMD ["sh", "-c", "node src/db/migrate.js && exec node src/server.js"]
