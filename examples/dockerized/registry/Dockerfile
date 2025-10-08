FROM node:24-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install # use npm ci after removing local install

COPY . .
RUN npx esbuild ./index.js --bundle --platform=node --outfile=build/index.js

FROM node:24-alpine AS app

ENV MICRO_REGISTRY_URL=http://0.0.0.0:13000
ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node --from=builder /app/build/index.js /app/index.js

ENTRYPOINT ["node", "index.js"]
