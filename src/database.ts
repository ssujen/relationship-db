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
        name TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        properties TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL,
        target_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        attributes TEXT NOT NULL,
        FOREIGN KEY (source_id) REFERENCES entities(id),
        FOREIGN KEY (target_id) REFERENCES entities(id)
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
}
