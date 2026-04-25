-- This script is executed once when the PostgreSQL container is first created.
-- It sets up the necessary tables for the AlphaScan AI application.

-- 1. Table for User Authentication
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Table for Backtest Task Tracking
CREATE TABLE IF NOT EXISTS backtest_tasks (
    task_id VARCHAR(255) PRIMARY KEY,
    user_id INTEGER,
    strategy_name VARCHAR(255),
    strategy_params JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, RUNNING, COMPLETED, FAILED
    result_summary JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Insert a guest user for demo purposes if not exists
-- This allows the app to work without a full login system in guest mode.
INSERT INTO users (id, email, password_hash)
VALUES (1, 'guest@alphascan.ai', 'guest_password_hash')
ON CONFLICT (id) DO NOTHING;

-- Grant privileges to the user defined in docker-compose.yml
-- Note: The user "user" is created by the postgres image environment variables.
GRANT ALL PRIVILEGES ON TABLE users TO "user";
GRANT ALL PRIVILEGES ON TABLE backtest_tasks TO "user";
GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO "user";

-- Log completion
\echo 'Database schema initialized successfully.'
