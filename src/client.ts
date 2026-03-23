import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

const PROTO_PATH = path.resolve(__dirname, '../proto/relationship.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const relationshipProto: any = grpc.loadPackageDefinition(packageDefinition).relationship;

const client = new relationshipProto.RelationshipService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

function addEntity(name: string, type: string, properties: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    client.addEntity({ name, type, properties }, (err: any, response: any) => {
      if (err) reject(err);
      else resolve(response.id);
    });
  });
}

function addRelationship(sourceName: string, targetName: string, type: string, attributes: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    client.addRelationship({ source_name: sourceName, target_name: targetName, type, attributes }, (err: any, response: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function queryRelationships(sourceName?: string, targetName?: string, relType?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    client.queryRelationships({ source_name: sourceName, target_name: targetName, relationship_type: relType }, (err: any, response: any) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

async function runTest() {
  try {
    console.log('--- Adding entities ---');
    await addEntity('Mary', 'Person', { age: '30' });
    await addEntity('John', 'Person', { age: '35' });
    await addEntity('Trump', 'Person', {});
    await addEntity('Powel', 'Person', {});

    console.log('--- Adding relationships ---');
    await addRelationship('John', 'Mary', 'husband_of', { since: '2010' });
    await addRelationship('Trump', 'Powel', 'hates', { intensity: 'high' });

    console.log('--- Querying: Who is the husband to Mary? ---');
    const q1 = await queryRelationships(undefined, 'Mary', 'husband_of');
    // Note: The query result returns source_name if joined, or just ids. 
    // My server implementation currently returns raw relationship rows.
    console.log('Result 1:', q1.summary, JSON.stringify(q1.relationships, null, 2));

    console.log('--- Querying: Does Trump hate Powel? ---');
    const q2 = await queryRelationships('Trump', 'Powel', 'hates');
    console.log('Result 2:', q2.summary, JSON.stringify(q2.relationships, null, 2));

  } catch (err) {
    console.error('Test failed:', err);
  }
}

runTest();
