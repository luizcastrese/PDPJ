# Imagem do pdpj-mcp-server no modo conector remoto (Streamable HTTP).
# Serve para qualquer plataforma que aceite um Dockerfile: Railway, Render,
# Fly.io, Google Cloud Run, Azure Container Apps, um VPS com Docker.

FROM node:22-alpine AS build
WORKDIR /app

# As dependências primeiro, para aproveitar o cache entre builds.
COPY package.json package-lock.json ./
# --ignore-scripts porque o "prepare" chamaria o build antes de o código chegar.
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY test ./test
RUN npm run build

# ---------------------------------------------------------------------------

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist

# A plataforma normalmente injeta PORT; 8080 é o padrão quando ela não injeta.
ENV PORT=8080
EXPOSE 8080

# Não roda como root.
USER node

CMD ["node", "dist/src/http.js"]
