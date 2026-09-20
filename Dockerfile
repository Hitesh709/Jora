FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Prove the native Jora coding loop during every production image build.
RUN npm run jora:acceptance

ENV NODE_ENV=production
ENV JORA_API_HOST=0.0.0.0

CMD ["npm","run","jora:api"]
