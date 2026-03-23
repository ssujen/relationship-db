# Stage 1: Build
FROM node:20 AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source and config files
COPY tsconfig.json ./
COPY proto/ ./proto/
COPY src/ ./src/

# Compile TypeScript
RUN npx tsc

# Stage 2: Runtime
FROM node:20-slim

WORKDIR /app

# Copy production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled files and proto files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/proto ./proto

# Create data directory for SQLite persistence
RUN mkdir -p data

# Expose gRPC port
EXPOSE 50051

# Environment variable for database path (optional, can be used to override)
# ENV DATABASE_PATH=/app/data/relationships.db

# Use volume for data persistence
VOLUME ["/app/data"]

CMD ["node", "dist/server.js"]
