FROM node:24-alpine AS builder

WORKDIR /app

# Copy micro-js source first
COPY micro-js micro-js

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy the service code
COPY index.js ./

# Bundle the application
RUN npx esbuild ./index.js --bundle --platform=node --outfile=build/index.js

FROM node:24-alpine AS app

ENV MICRO_REGISTRY_URL=http://0.0.0.0:13000
ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node --from=builder /app/build/index.js /app/index.js

ENTRYPOINT ["node", "index.js"]
