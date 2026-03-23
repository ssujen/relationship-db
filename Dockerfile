# Stage 1: Build
FROM node:20 AS builder

WORKDIR /app

# Install build essentials for native modules (sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package*.json ./
# Build from source to ensure compatibility with the container's GLIBC
RUN npm install --build-from-source

# Copy source and config files
COPY tsconfig.json ./
COPY proto/ ./proto/
COPY src/ ./src/

# Compile TypeScript
RUN npx tsc

# Stage 2: Runtime
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy node_modules from builder and prune devDependencies
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --production

# Copy compiled files and proto files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/proto ./proto

# Create data directory for SQLite persistence
RUN mkdir -p data

# Expose gRPC port
EXPOSE 50051

# Use volume for data persistence
VOLUME ["/app/data"]

CMD ["node", "dist/server.js"]

