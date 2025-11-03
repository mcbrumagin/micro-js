FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY src/ ./src/
COPY examples/all-in-one/ ./examples/all-in-one/

# Set environment variables
ENV MICRO_REGISTRY_URL=http://localhost:10000
ENV ENVIRONMENT=production
ENV LOG_LEVEL=info

# Expose registry port
EXPOSE 10000

# Run the all-in-one service
CMD ["node", "examples/all-in-one/bootstrap.js"]

