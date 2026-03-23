package main

import (
	"context"
	"log"
	"relationship-db/proto"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	conn, err := grpc.Dial("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("did not connect: %v", err)
	}
	defer conn.Close()
	c := proto.NewRelationshipServiceClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	log.Println("--- Adding entities ---")
	entities := []struct {
		name string
		typ  string
	}{
		{"Alice", "Person"},
		{"Bob", "Person"},
		{"Charlie", "Person"},
		{"David", "Person"},
	}

	for _, e := range entities {
		res, err := c.AddEntity(ctx, &proto.AddEntityRequest{
			Name: e.name,
			Type: e.typ,
		})
		if err != nil {
			log.Printf("could not add entity %s: %v", e.name, err)
			continue
		}
		log.Printf("Added entity: %s (ID: %d)", e.name, res.Id)
	}

	log.Println("--- Adding relationships (Chain: Alice -> Bob -> Charlie -> David) ---")
	relationships := []struct {
		src  string
		dst  string
		typ  string
	}{
		{"Alice", "Bob", "friend"},
		{"Bob", "Charlie", "friend"},
		{"Charlie", "David", "friend"},
	}

	for _, r := range relationships {
		_, err := c.AddRelationship(ctx, &proto.AddRelationshipRequest{
			SourceName: r.src,
			TargetName: r.dst,
			Type:       r.typ,
		})
		if err != nil {
			log.Printf("could not add relationship: %v", err)
			continue
		}
		log.Printf("Added relationship: %s -> %s (%s)", r.src, r.dst, r.typ)
	}

	log.Println("--- Pathfinding: Alice to Charlie ---")
	path1, err := c.FindPath(ctx, &proto.FindPathRequest{
		SourceName: "Alice",
		TargetName: "Charlie",
		MaxDepth:   5,
	})
	if err != nil {
		log.Fatalf("FindPath failed: %v", err)
	}
	log.Printf("Result: %s", path1.Summary)
	if len(path1.Entities) > 0 {
		var pathStr string
		for i, e := range path1.Entities {
			if i > 0 {
				pathStr += " -> "
			}
			pathStr += e.Name
		}
		log.Printf("Path: %s", pathStr)
	}

	log.Println("--- Pathfinding: Alice to David ---")
	path2, err := c.FindPath(ctx, &proto.FindPathRequest{
		SourceName: "Alice",
		TargetName: "David",
		MaxDepth:   5,
	})
	if err != nil {
		log.Fatalf("FindPath failed: %v", err)
	}
	log.Printf("Result: %s", path2.Summary)
	if len(path2.Entities) > 0 {
		var pathStr string
		for i, e := range path2.Entities {
			if i > 0 {
				pathStr += " -> "
			}
			pathStr += e.Name
		}
		log.Printf("Path: %s", pathStr)
	}

	log.Println("--- Exploration: Alice (depth 2) ---")
	exp1, err := c.Explore(ctx, &proto.ExploreRequest{
		SourceName: "Alice",
		MaxDepth:   2,
	})
	if err != nil {
		log.Fatalf("Explore failed: %v", err)
	}
	log.Printf("Result: %s", exp1.Summary)
	var entNames string
	for i, e := range exp1.Entities {
		if i > 0 {
			entNames += ", "
		}
		entNames += e.Name
	}
	log.Printf("Found Entities: %s", entNames)
}
