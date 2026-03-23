import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { RelationshipDb } from './database';

const PROTO_PATH = path.resolve(__dirname, '../proto/relationship.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const relationshipProto: any = grpc.loadPackageDefinition(packageDefinition).relationship;

const db = new RelationshipDb();

const server = new grpc.Server();

server.addService(relationshipProto.RelationshipService.service, {
  AddEntity: async (call: any, callback: any) => {
    try {
      const { name, type, properties } = call.request;
      const id = await db.addEntity({ name, type, properties });
      callback(null, { id, message: `Entity ${name} added successfully.` });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  AddRelationship: async (call: any, callback: any) => {
    try {
      const { source_name, target_name, type, attributes } = call.request;
      
      const source = await db.getEntityByName(source_name);
      const target = await db.getEntityByName(target_name);

      if (!source || !target) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: `Source or target entity not found: ${source_name}, ${target_name}`
        });
      }

      await db.addRelationship({
        source_id: source.id!,
        target_id: target.id!,
        type,
        attributes
      });

      callback(null, { message: `Relationship ${type} from ${source_name} to ${target_name} added.` });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  QueryRelationships: async (call: any, callback: any) => {
    try {
      const { source_name, target_name, relationship_type } = call.request;
      const results = await db.queryRelationships(source_name, target_name, relationship_type);
      
      const response = {
        entities: [],
        relationships: results.map((r: any) => ({
          id: r.id,
          source_id: r.source_id,
          target_id: r.target_id,
          type: r.type,
          attributes: r.attributes
        })),
        summary: `Found ${results.length} relationships.`
      };

      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  FindPath: async (call: any, callback: any) => {
    try {
      const { source_name, target_name, max_depth } = call.request;
      const { nodes, links } = await db.findPath(source_name, target_name, max_depth || 5);
      
      callback(null, {
        entities: nodes,
        relationships: links,
        summary: nodes.length > 0 ? `Found path of length ${links.length}.` : 'No path found.'
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  Explore: async (call: any, callback: any) => {
    try {
      const { source_name, max_depth } = call.request;
      const { nodes, links } = await db.explore(source_name, max_depth || 3);
      
      callback(null, {
        entities: nodes,
        relationships: links,
        summary: `Explored ${nodes.length} entities and ${links.length} relationships.`
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  }
});

async function main() {
  await db.init();
  const port = '0.0.0.0:50051';
  
  server.bindAsync(port, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
    if (err) {
      console.error('Failed to bind server:', err);
      return;
    }
    console.log(`Server running at http://0.0.0.0:50051`);
  });
}

main();
