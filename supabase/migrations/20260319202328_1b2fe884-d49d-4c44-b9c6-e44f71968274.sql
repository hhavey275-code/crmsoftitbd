ALTER TABLE ad_accounts ADD COLUMN platform TEXT NOT NULL DEFAULT 'meta';
ALTER TABLE business_managers ADD COLUMN platform TEXT NOT NULL DEFAULT 'meta';