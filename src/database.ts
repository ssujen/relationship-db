import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

export interface Entity {
  id?: number;
  name: string;
  type: string;
  properties: Record<string, string>;
}

export interface Relationship {
  id?: number;
  source_id: number;
  target_id: number;
  type: string;
  attributes: Record<string, string>;
}

export class RelationshipDb {
  private db?: Database;

  async init() {
    this.db = await open({
      filename: path.join(__dirname, '../data/relationships.db'),
      driver: sqlite3.Database
    });

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        type TEXT,
        properties TEXT
      );

      CREATE TABLE IF NOT EXISTS relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER,
        target_id INTEGER,
        type TEXT,
        attributes TEXT,
        FOREIGN KEY(source_id) REFERENCES entities(id),
        FOREIGN KEY(target_id) REFERENCES entities(id)
      );
    `);
  }

  async addEntity(entity: Entity): Promise<number> {
    const result = await this.db!.run(
      'INSERT OR IGNORE INTO entities (name, type, properties) VALUES (?, ?, ?)',
      [entity.name, entity.type, JSON.stringify(entity.properties)]
    );
    
    if (result.changes === 0) {
      const existing = await this.db!.get('SELECT id FROM entities WHERE name = ?', [entity.name]);
      return existing.id;
    }
    return result.lastID!;
  }

  async getEntityByName(name: string): Promise<Entity | undefined> {
    const row = await this.db!.get('SELECT * FROM entities WHERE name = ?', [name]);
    if (row) {
      return { ...row, properties: JSON.parse(row.properties) };
    }
    return undefined;
  }
  
  async getEntityById(id: number): Promise<Entity | undefined> {
    const row = await this.db!.get('SELECT * FROM entities WHERE id = ?', [id]);
    if (row) {
      return { ...row, properties: JSON.parse(row.properties) };
    }
    return undefined;
  }

  async addRelationship(rel: Relationship): Promise<void> {
    await this.db!.run(
      'INSERT INTO relationships (source_id, target_id, type, attributes) VALUES (?, ?, ?, ?)',
      [rel.source_id, rel.target_id, rel.type, JSON.stringify(rel.attributes)]
    );
  }

  async queryRelationships(sourceName?: string, targetName?: string, relType?: string) {
    let query = `
      SELECT r.*, e1.name as source_name, e2.name as target_name 
      FROM relationships r
      JOIN entities e1 ON r.source_id = e1.id
      JOIN entities e2 ON r.target_id = e2.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (sourceName) {
      query += ' AND e1.name = ?';
      params.push(sourceName);
    }
    if (targetName) {
      query += ' AND e2.name = ?';
      params.push(targetName);
    }
    if (relType) {
      query += ' AND r.type = ?';
      params.push(relType);
    }

    const rows = await this.db!.all(query, params);
    return rows.map(row => ({
      ...row,
      attributes: JSON.parse(row.attributes)
    }));
  }

  async getNeighbors(entityId: number): Promise<{ entity: Entity, relationship: Relationship }[]> {
    const query = `
      SELECT r.*, e.name, e.type as entity_type, e.properties
      FROM relationships r
      JOIN entities e ON r.target_id = e.id
      WHERE r.source_id = ?
      UNION
      SELECT r.*, e.name, e.type as entity_type, e.properties
      FROM relationships r
      JOIN entities e ON r.source_id = e.id
      WHERE r.target_id = ?
    `;
    const rows = await this.db!.all(query, [entityId, entityId]);
    return rows.map(row => ({
      entity: {
        id: row.source_id === entityId ? row.target_id : row.source_id,
        name: row.name,
        type: row.entity_type,
        properties: JSON.parse(row.properties)
      },
      relationship: {
        id: row.id,
        source_id: row.source_id,
        target_id: row.target_id,
        type: row.type,
        attributes: JSON.parse(row.attributes)
      }
    }));
  }

  async findPath(sourceName: string, targetName: string, maxDepth: number = 5): Promise<{ nodes: Entity[], links: Relationship[] }> {
    const source = await this.getEntityByName(sourceName);
    const target = await this.getEntityByName(targetName);

    if (!source || !target) return { nodes: [], links: [] };
    if (source.id === target.id) return { nodes: [source], links: [] };

    const queue: { id: number, path: number[], links: number[] }[] = [{ id: source.id!, path: [source.id!], links: [] }];
    const visited = new Set<number>([source.id!]);

    while (queue.length > 0) {
      const { id, path, links } = queue.shift()!;
      if (path.length > maxDepth) continue;

      const neighbors = await this.getNeighbors(id);
      for (const { entity, relationship } of neighbors) {
        if (entity.id === target.id) {
          const finalPath = [...path, entity.id!];
          const finalLinks = [...links, relationship.id!];
          
          // Hydrate entities and relationships
          const nodes = await Promise.all(finalPath.map(nid => this.getEntityById(nid)));
          const rels = await Promise.all(finalLinks.map(rid => this.getRelationshipById(rid)));
          
          return {
            nodes: nodes.filter(n => !!n) as Entity[],
            links: rels.filter(r => !!r) as Relationship[]
          };
        }

        if (!visited.has(entity.id!)) {
          visited.add(entity.id!);
          queue.push({
            id: entity.id!,
            path: [...path, entity.id!],
            links: [...links, relationship.id!]
          });
        }
      }
    }

    return { nodes: [], links: [] };
  }

  async explore(sourceName: string, maxDepth: number = 3): Promise<{ nodes: Entity[], links: Relationship[] }> {
    const source = await this.getEntityByName(sourceName);
    if (!source) return { nodes: [], links: [] };

    const nodesMap = new Map<number, Entity>();
    const linksMap = new Map<number, Relationship>();
    nodesMap.set(source.id!, source);

    const queue: { id: number, depth: number }[] = [{ id: source.id!, depth: 0 }];
    const visited = new Set<number>([source.id!]);

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (depth >= maxDepth) continue;

      const neighbors = await this.getNeighbors(id);
      for (const { entity, relationship } of neighbors) {
        nodesMap.set(entity.id!, entity);
        linksMap.set(relationship.id!, relationship);

        if (!visited.has(entity.id!)) {
          visited.add(entity.id!);
          queue.push({ id: entity.id!, depth: depth + 1 });
        }
      }
    }

    return {
      nodes: Array.from(nodesMap.values()),
      links: Array.from(linksMap.values())
    };
  }

  async getRelationshipById(id: number): Promise<Relationship | undefined> {
    const row = await this.db!.get('SELECT * FROM relationships WHERE id = ?', [id]);
    if (row) {
      return { ...row, attributes: JSON.parse(row.attributes) };
    }
    return undefined;
  }
}
