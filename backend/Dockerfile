FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY src ./src
COPY openapi ./openapi

EXPOSE 4000
USER node

# Aplica el esquema (idempotente) y luego arranca la API. Con SEED_INICIAL=true carga además el catálogo inicial de
# canchas si la tabla está vacía (nunca borra datos); es lo que usa Render, que no ofrece comando previo en el plan gratuito.
CMD ["sh", "-c", "node src/db/migrate.js && if [ \"$SEED_INICIAL\" = \"true\" ]; then node src/seed/seedInicial.js; fi && exec node src/server.js"]
