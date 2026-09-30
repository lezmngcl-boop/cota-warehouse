-- Products: one row per SKU.
CREATE TABLE products (
  sku             TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  units_per_case  INTEGER NOT NULL CHECK (units_per_case > 0)
);

-- Storage locations. Code is "A<aisle>-R<rack>-S<shelf>"; the parts are stored
-- as numbers so the pick walk can sort on them.
CREATE TABLE locations (
  code   TEXT PRIMARY KEY,
  aisle  INTEGER NOT NULL,
  rack   INTEGER NOT NULL,
  shelf  INTEGER NOT NULL
);

-- Full cases of a SKU at a location. One SKU can sit in several locations.
CREATE TABLE stock (
  sku       TEXT NOT NULL REFERENCES products(sku),
  location  TEXT NOT NULL REFERENCES locations(code),
  cases     INTEGER NOT NULL CHECK (cases >= 0),
  PRIMARY KEY (sku, location)
);

-- Open (pick-face) shelf for a SKU: loose units, not cases.
CREATE TABLE open_shelf (
  sku             TEXT PRIMARY KEY REFERENCES products(sku),
  capacity_units  INTEGER NOT NULL CHECK (capacity_units > 0),
  current_units   INTEGER NOT NULL CHECK (current_units >= 0)
);

INSERT INTO products (sku, name, units_per_case) VALUES
  ('TURTLE-01', 'Sea Turtle Plush', 12),
  ('SHARK-02',  'Shark Plush',       8),
  ('MOOSE-03',  'Moose Plush',       6),
  ('ALIEN-04',  'Alien Plush',      12);

INSERT INTO locations (code, aisle, rack, shelf) VALUES
  ('A1-R2-S1', 1, 2, 1),
  ('A4-R1-S2', 4, 1, 2),
  ('A2-R3-S1', 2, 3, 1),
  ('A5-R1-S1', 5, 1, 1),
  ('A3-R4-S2', 3, 4, 2);

INSERT INTO stock (sku, location, cases) VALUES
  ('TURTLE-01', 'A1-R2-S1', 18),
  ('TURTLE-01', 'A4-R1-S2',  7),
  ('SHARK-02',  'A2-R3-S1', 14),
  ('MOOSE-03',  'A5-R1-S1',  9),
  ('ALIEN-04',  'A3-R4-S2',  4);

-- Only TURTLE-01 was given open-shelf figures; other SKUs are entered on screen.
INSERT INTO open_shelf (sku, capacity_units, current_units) VALUES
  ('TURTLE-01', 60, 17);
