# Stage 1: Build
FROM golang:1.24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git

WORKDIR /app

# Copy go mod and sum files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the server binary
RUN CGO_ENABLED=0 GOOS=linux go build -v -o server cmd/server/main.go

# Stage 2: Runtime
FROM alpine:latest

# Install runtime dependencies (though modernc sqlite doesn't need many)
RUN apk add --no-cache ca-certificates

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/server .

# Create data directory for SQLite persistence
RUN mkdir -p data

# Expose gRPC port
EXPOSE 50051

# Use volume for data persistence
VOLUME ["/app/data"]

# Run the server
ENTRYPOINT ["./server"]
