# Relationship Knowledge Base Backend (Go)

A high-performance gRPC service for managing and querying a graph of personal relationships, built with Go and CGO-less SQLite.

## Features

- **Entity Management**: Store persons or objects with custom JSON-serializable properties.
- **Relationship Linking**: Define directed, typed connections between entities (e.g., "spouse_of", "colleague").
- **Graph Queries**:
  - **Pathfinding**: Discover the shortest connection path between two entities using Breadth-First Search (BFS).
  - **Exploration**: Explore the local neighborhood of an entity within a specified degree of separation.
- **Persistent Storage**: Lightweight SQLite database with automatic schema management.

## Project Structure

- `cmd/server/`: The main gRPC server entry point.
- `cmd/client/`: A comprehensive test client for functional verification.
- `internal/database/`: SQLite database layer with optimized BFS algorithms.
- `internal/service/`: gRPC service handlers implementation.
- `proto/`: Protobuf service definitions and generated Go code.

## Setup & Running Locally

### Prerequisites
- Go 1.24+
- `protoc` (if modifying `.proto` files)

### 1. Install dependencies
```bash
go mod tidy
```

### 2. Start the server
```bash
go run cmd/server/main.go
```

### 3. Run the verification client
```bash
go run cmd/client/main.go
```

## Docker Deployment (Multi-Stage)

The project includes a multi-stage `Dockerfile` that produces a minimal runner image.

### 1. Build the image
```bash
docker build -t relationship-db-go .
```

### 2. Run the container
```bash
docker run -d -p 50051:50051 -v $(pwd)/data:/app/data relationship-db-go
```
*Note: The `/app/data` volume ensures relationship data persists across restarts.*

## Database

By default, data is stored in a SQLite database file at `data/relationships.db`.

## Client Integration

Clients should use `proto/relationship.proto` to generate compatible stubs. This backend is designed to work seamlessly with privacy-focused Android applications (e.g., using Gemini Nano for natural language processing).
