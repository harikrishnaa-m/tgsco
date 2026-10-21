# syntax=docker/dockerfile:1
FROM node:22-alpine

LABEL com.qmarkdesk.app="tgsco-backend"

ENV NODE_ENV=production
WORKDIR /app

# --ignore-scripts skips the husky "prepare" hook, which only applies to local development.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY src ./src

# Multer stages video uploads in tmp/videos before they are sent to Spaces.
RUN mkdir -p tmp/videos && chown -R node:node tmp

USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
