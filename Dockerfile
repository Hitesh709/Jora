FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates chromium \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Production images are built from the same code that CI verifies.
# Full acceptance remains a CI gate rather than a container startup/build gate.

ENV NODE_ENV=production
ENV JORA_BROWSER_EXECUTABLE=/usr/bin/chromium

# Railway source-sync verification marker: 2026-09-22-v3
CMD ["npm","run","jora:api"]
