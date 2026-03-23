package service

import (
	"context"
	"fmt"
	"relationship-db/internal/database"
	"relationship-db/proto"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type RelationshipService struct {
	proto.UnimplementedRelationshipServiceServer
	DB *database.DB
}

func (s *RelationshipService) AddEntity(ctx context.Context, req *proto.AddEntityRequest) (*proto.AddEntityResponse, error) {
	id, err := s.DB.AddEntity(database.Entity{
		Name:       req.Name,
		Type:       req.Type,
		Properties: req.Properties,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to add entity: %v", err)
	}
	return &proto.AddEntityResponse{
		Id:      id,
		Message: fmt.Sprintf("Entity %s added successfully.", req.Name),
	}, nil
}

func (s *RelationshipService) AddRelationship(ctx context.Context, req *proto.AddRelationshipRequest) (*proto.AddRelationshipResponse, error) {
	source, err := s.DB.GetEntityByName(req.SourceName)
	if err != nil || source == nil {
		return nil, status.Errorf(codes.NotFound, "source entity not found: %s", req.SourceName)
	}

	target, err := s.DB.GetEntityByName(req.TargetName)
	if err != nil || target == nil {
		return nil, status.Errorf(codes.NotFound, "target entity not found: %s", req.TargetName)
	}

	err = s.DB.AddRelationship(database.Relationship{
		SourceID:   source.ID,
		TargetID:   target.ID,
		Type:       req.Type,
		Attributes: req.Attributes,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to add relationship: %v", err)
	}

	return &proto.AddRelationshipResponse{
		Message: fmt.Sprintf("Relationship %s from %s to %s added.", req.Type, req.SourceName, req.TargetName),
	}, nil
}

func (s *RelationshipService) QueryRelationships(ctx context.Context, req *proto.QueryRequest) (*proto.QueryResponse, error) {
	rels, err := s.DB.QueryRelationships(req.SourceName, req.TargetName, req.RelationshipType)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to query relationships: %v", err)
	}

	var protoRels []*proto.Relationship
	for _, r := range rels {
		protoRels = append(protoRels, &proto.Relationship{
			Id:         r.ID,
			SourceId:   r.SourceID,
			TargetId:   r.TargetID,
			Type:       r.Type,
			Attributes: r.Attributes,
		})
	}

	return &proto.QueryResponse{
		Relationships: protoRels,
		Summary:       fmt.Sprintf("Found %d relationships.", len(protoRels)),
	}, nil
}

func (s *RelationshipService) FindPath(ctx context.Context, req *proto.FindPathRequest) (*proto.QueryResponse, error) {
	maxDepth := req.MaxDepth
	if maxDepth == 0 {
		maxDepth = 5
	}

	nodes, links, err := s.DB.FindPath(req.SourceName, req.TargetName, maxDepth)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to find path: %v", err)
	}

	var protoNodes []*proto.Entity
	for _, n := range nodes {
		protoNodes = append(protoNodes, &proto.Entity{
			Id:         n.ID,
			Name:       n.Name,
			Type:       n.Type,
			Properties: n.Properties,
		})
	}

	var protoRels []*proto.Relationship
	for _, l := range links {
		protoRels = append(protoRels, &proto.Relationship{
			Id:         l.ID,
			SourceId:   l.SourceID,
			TargetId:   l.TargetID,
			Type:       l.Type,
			Attributes: l.Attributes,
		})
	}

	summary := "No path found."
	if len(protoNodes) > 0 {
		summary = fmt.Sprintf("Found path of length %d.", len(protoRels))
	}

	return &proto.QueryResponse{
		Entities:      protoNodes,
		Relationships: protoRels,
		Summary:       summary,
	}, nil
}

func (s *RelationshipService) Explore(ctx context.Context, req *proto.ExploreRequest) (*proto.QueryResponse, error) {
	maxDepth := req.MaxDepth
	if maxDepth == 0 {
		maxDepth = 3
	}

	nodes, links, err := s.DB.Explore(req.SourceName, maxDepth)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to explore: %v", err)
	}

	var protoNodes []*proto.Entity
	for _, n := range nodes {
		protoNodes = append(protoNodes, &proto.Entity{
			Id:         n.ID,
			Name:       n.Name,
			Type:       n.Type,
			Properties: n.Properties,
		})
	}

	var protoRels []*proto.Relationship
	for _, l := range links {
		protoRels = append(protoRels, &proto.Relationship{
			Id:         l.ID,
			SourceId:   l.SourceID,
			TargetId:   l.TargetID,
			Type:       l.Type,
			Attributes: l.Attributes,
		})
	}

	return &proto.QueryResponse{
		Entities:      protoNodes,
		Relationships: protoRels,
		Summary:       fmt.Sprintf("Explored %d entities and %d relationships.", len(protoNodes), len(protoRels)),
	}, nil
}

func RegisterService(s *grpc.Server, db *database.DB) {
	proto.RegisterRelationshipServiceServer(s, &RelationshipService{DB: db})
}
