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
  'localhost:51051',
  grpc.credentials.createInsecure()
);

function addEntity(name: string, type: string, properties: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    client.AddEntity({ name, type, properties }, (err: any, response: any) => {
      if (err) reject(err);
      else resolve(response.id);
    });
  });
}

function addRelationship(sourceName: string, targetName: string, type: string, attributes: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    client.AddRelationship({ source_name: sourceName, target_name: targetName, type, attributes }, (err: any, response: any) => {
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

function findPath(sourceName: string, targetName: string, maxDepth: number = 5): Promise<any> {
  return new Promise((resolve, reject) => {
    client.FindPath({ source_name: sourceName, target_name: targetName, max_depth: maxDepth }, (err: any, response: any) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

function explore(sourceName: string, maxDepth: number = 3): Promise<any> {
  return new Promise((resolve, reject) => {
    client.Explore({ source_name: sourceName, max_depth: maxDepth }, (err: any, response: any) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

async function setupTestData() {
  console.log('--- Setting up test data ---');
  const aliceId = await addEntity('Alice', 'Person', {});
  const bobId = await addEntity('Bob', 'Person', {});
  const charlieId = await addEntity('Charlie', 'Person', {});
  const daveId = await addEntity('David', 'Person', {});

  console.log('--- Adding relationships (Chain: Alice -> Bob -> Charlie -> David) ---');
  await addRelationship('Alice', 'Bob', 'friend', {});
  await addRelationship('Bob', 'Charlie', 'friend', {});
  await addRelationship('Charlie', 'David', 'friend', {});
  console.log('--- Test data setup complete ---\n');
  return { aliceId, bobId, charlieId, daveId };
}

async function runTests() {
  console.log('Starting advanced query tests...');
  try {
    const { aliceId, bobId, charlieId, daveId } = await setupTestData();

    console.log('--- Pathfinding: Alice to Charlie ---');
    const path1 = await findPath('Alice', 'Charlie');
    console.log('Result:', path1.summary);
    console.log('Path Nodes:', path1.entities.map((e: any) => e.name).join(' -> '));

    console.log('--- Pathfinding: Alice to David ---');
    const path2 = await findPath('Alice', 'David', 5);
    console.log('Result:', path2.summary);
    console.log('Path Nodes:', path2.entities.map((e: any) => e.name).join(' -> '));

    console.log('--- Exploration: Alice (depth 2) ---');
    const exp1 = await explore('Alice', 2);
    console.log('Result:', exp1.summary);
    console.log('Found Entities:', exp1.entities.map((e: any) => e.name).join(', '));

  } catch (err) {
    console.error('Test failed:', err);
  }
}

runTests();
