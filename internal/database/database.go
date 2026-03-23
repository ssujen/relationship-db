package database

import (
	"database/sql"
	"encoding/json"

	_ "modernc.org/sqlite"
)

type Entity struct {
	ID         int32             `json:"id"`
	Name       string            `json:"name"`
	Type       string            `json:"type"`
	Properties map[string]string `json:"properties"`
}

type Relationship struct {
	ID         int32             `json:"id"`
	SourceID   int32             `json:"source_id"`
	TargetID   int32             `json:"target_id"`
	Type       string            `json:"type"`
	Attributes map[string]string `json:"attributes"`
}

type DB struct {
	conn *sql.DB
}

func NewDB(dbPath string) (*DB, error) {
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	_, err = conn.Exec(`
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
	`)
	if err != nil {
		return nil, err
	}

	return &DB{conn: conn}, nil
}

func (db *DB) AddEntity(e Entity) (int32, error) {
	props, _ := json.Marshal(e.Properties)
	res, err := db.conn.Exec("INSERT OR IGNORE INTO entities (name, type, properties) VALUES (?, ?, ?)", e.Name, e.Type, string(props))
	if err != nil {
		return 0, err
	}

	affected, _ := res.RowsAffected()
	if affected == 0 {
		var id int32
		err := db.conn.QueryRow("SELECT id FROM entities WHERE name = ?", e.Name).Scan(&id)
		return id, err
	}

	id, _ := res.LastInsertId()
	return int32(id), nil
}

func (db *DB) GetEntityByName(name string) (*Entity, error) {
	var e Entity
	var props string
	err := db.conn.QueryRow("SELECT id, name, type, properties FROM entities WHERE name = ?", name).Scan(&e.ID, &e.Name, &e.Type, &props)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	json.Unmarshal([]byte(props), &e.Properties)
	return &e, nil
}

func (db *DB) GetEntityByID(id int32) (*Entity, error) {
	var e Entity
	var props string
	err := db.conn.QueryRow("SELECT id, name, type, properties FROM entities WHERE id = ?", id).Scan(&e.ID, &e.Name, &e.Type, &props)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	json.Unmarshal([]byte(props), &e.Properties)
	return &e, nil
}

func (db *DB) AddRelationship(r Relationship) error {
	attrs, _ := json.Marshal(r.Attributes)
	_, err := db.conn.Exec("INSERT INTO relationships (source_id, target_id, type, attributes) VALUES (?, ?, ?, ?)", r.SourceID, r.TargetID, r.Type, string(attrs))
	return err
}

func (db *DB) QueryRelationships(sourceName, targetName, relType string) ([]*Relationship, error) {
	query := `
		SELECT r.id, r.source_id, r.target_id, r.type, r.attributes
		FROM relationships r
		JOIN entities e1 ON r.source_id = e1.id
		JOIN entities e2 ON r.target_id = e2.id
		WHERE 1=1
	`
	var args []interface{}
	if sourceName != "" {
		query += " AND e1.name = ?"
		args = append(args, sourceName)
	}
	if targetName != "" {
		query += " AND e2.name = ?"
		args = append(args, targetName)
	}
	if relType != "" {
		query += " AND r.type = ?"
		args = append(args, relType)
	}

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*Relationship
	for rows.Next() {
		var r Relationship
		var attrs string
		if err := rows.Scan(&r.ID, &r.SourceID, &r.TargetID, &r.Type, &attrs); err != nil {
			return nil, err
		}
		json.Unmarshal([]byte(attrs), &r.Attributes)
		results = append(results, &r)
	}
	return results, nil
}

func (db *DB) GetNeighbors(entityID int32) ([]NeighborResult, error) {
	query := `
		SELECT r.id, r.source_id, r.target_id, r.type, r.attributes, e.id, e.name, e.type, e.properties
		FROM relationships r
		JOIN entities e ON r.target_id = e.id
		WHERE r.source_id = ?
		UNION
		SELECT r.id, r.source_id, r.target_id, r.type, r.attributes, e.id, e.name, e.type, e.properties
		FROM relationships r
		JOIN entities e ON r.source_id = e.id
		WHERE r.target_id = ?
	`
	rows, err := db.conn.Query(query, entityID, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []NeighborResult
	for rows.Next() {
		var res NeighborResult
		var rattrs, eprops string
		if err := rows.Scan(&res.Rel.ID, &res.Rel.SourceID, &res.Rel.TargetID, &res.Rel.Type, &rattrs, &res.Ent.ID, &res.Ent.Name, &res.Ent.Type, &eprops); err != nil {
			return nil, err
		}
		json.Unmarshal([]byte(rattrs), &res.Rel.Attributes)
		json.Unmarshal([]byte(eprops), &res.Ent.Properties)
		
		// Adjust entry entity to be the OTHER one
		if res.Ent.ID == entityID {
			// This happens in the second part of union where we joined source_id = e.id but target_id = entityID
			// Actually, the query logic in TS was:
			// JOIN entities e ON r.source_id = e.id WHERE r.target_id = ?
			// So res.Ent is the neighbor.
		}
		results = append(results, res)
	}
	return results, nil
}

type NeighborResult struct {
	Rel Relationship
	Ent Entity
}

func (db *DB) FindPath(sourceName, targetName string, maxDepth int32) ([]*Entity, []*Relationship, error) {
	source, _ := db.GetEntityByName(sourceName)
	target, _ := db.GetEntityByName(targetName)
	if source == nil || target == nil {
		return nil, nil, nil
	}
	if source.ID == target.ID {
		return []*Entity{source}, nil, nil
	}

	type queueItem struct {
		id    int32
		path  []int32
		links []int32
	}

	queue := []queueItem{{id: source.ID, path: []int32{source.ID}, links: []int32{}}}
	visited := map[int32]bool{source.ID: true}

	for len(queue) > 0 {
		item := queue[0]
		queue = queue[1:]

		if int32(len(item.path)) > maxDepth {
			continue
		}

		neighbors, _ := db.GetNeighbors(item.id)
		for _, neighbor := range neighbors {
			if neighbor.Ent.ID == target.ID {
				finalPathIDs := append(item.path, neighbor.Ent.ID)
				finalLinkIDs := append(item.links, neighbor.Rel.ID)

				var nodes []*Entity
				for _, nid := range finalPathIDs {
					n, _ := db.GetEntityByID(nid)
					nodes = append(nodes, n)
				}
				var links []*Relationship
				for _, rid := range finalLinkIDs {
					l, _ := db.GetRelationshipByID(rid)
					links = append(links, l)
				}
				return nodes, links, nil
			}

			if !visited[neighbor.Ent.ID] {
				visited[neighbor.Ent.ID] = true
				newPath := make([]int32, len(item.path)+1)
				copy(newPath, item.path)
				newPath[len(item.path)] = neighbor.Ent.ID

				newLinks := make([]int32, len(item.links)+1)
				copy(newLinks, item.links)
				newLinks[len(item.links)] = neighbor.Rel.ID

				queue = append(queue, queueItem{
					id:    neighbor.Ent.ID,
					path:  newPath,
					links: newLinks,
				})
			}
		}
	}
	return nil, nil, nil
}

func (db *DB) Explore(sourceName string, maxDepth int32) ([]*Entity, []*Relationship, error) {
	source, _ := db.GetEntityByName(sourceName)
	if source == nil {
		return nil, nil, nil
	}

	nodesMap := make(map[int32]*Entity)
	linksMap := make(map[int32]*Relationship)
	nodesMap[source.ID] = source

	type queueItem struct {
		id    int32
		depth int32
	}
	queue := []queueItem{{id: source.ID, depth: 0}}
	visited := map[int32]bool{source.ID: true}

	for len(queue) > 0 {
		item := queue[0]
		queue = queue[1:]

		if item.depth >= maxDepth {
			continue
		}

		neighbors, _ := db.GetNeighbors(item.id)
		for _, neighbor := range neighbors {
			ent := neighbor.Ent
			rel := neighbor.Rel
			nodesMap[ent.ID] = &ent
			linksMap[rel.ID] = &rel

			if !visited[ent.ID] {
				visited[ent.ID] = true
				queue = append(queue, queueItem{id: ent.ID, depth: item.depth + 1})
			}
		}
	}

	var nodes []*Entity
	for _, n := range nodesMap {
		nodes = append(nodes, n)
	}
	var links []*Relationship
	for _, l := range linksMap {
		links = append(links, l)
	}
	return nodes, links, nil
}

func (db *DB) GetRelationshipByID(id int32) (*Relationship, error) {
	var r Relationship
	var attrs string
	err := db.conn.QueryRow("SELECT id, source_id, target_id, type, attributes FROM relationships WHERE id = ?", id).Scan(&r.ID, &r.SourceID, &r.TargetID, &r.Type, &attrs)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	json.Unmarshal([]byte(attrs), &r.Attributes)
	return &r, nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}
