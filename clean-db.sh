#!/bin/bash

# ElizaOS Database Cleaner Script
# This script cleans the elizaos_db database by removing all data while preserving the schema structure

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="elizaos_db"
DB_USER="elizaos_user"
PG_USER="postgres"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if PostgreSQL is running
check_postgres() {
    if ! sudo -u $PG_USER psql -c "SELECT 1;" >/dev/null 2>&1; then
        print_error "PostgreSQL is not running or not accessible"
        exit 1
    fi
}

# Function to check if database exists
check_database() {
    if ! sudo -u $PG_USER psql -l | grep -q "$DB_NAME"; then
        print_error "Database '$DB_NAME' does not exist"
        exit 1
    fi
}

# Function to get all table names
get_tables() {
    sudo -u $PG_USER psql -d $DB_NAME -t -c "
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename;
    " | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$'
}

# Function to clean database
clean_database() {
    print_status "Starting database cleanup..."

    # Get all tables
    TABLES=$(get_tables)

    if [ -z "$TABLES" ]; then
        print_warning "No tables found in database"
        return
    fi

    print_status "Found tables: $(echo $TABLES | tr '\n' ' ')"

    # Create comma-separated list for TRUNCATE
    TABLE_LIST=$(echo "$TABLES" | tr '\n' ',' | sed 's/,$//')

    # Execute cleanup
    print_status "Truncating tables..."
    sudo -u $PG_USER psql -d $DB_NAME -c "
        -- Disable foreign key constraints temporarily
        SET session_replication_role = 'replica';

        -- Truncate all tables
        TRUNCATE TABLE $TABLE_LIST CASCADE;

        -- Re-enable foreign key constraints
        SET session_replication_role = 'origin';
    " >/dev/null 2>&1

    print_success "All tables truncated successfully"
}

# Function to verify cleanup
verify_cleanup() {
    print_status "Verifying cleanup..."

    # Check row counts for a few key tables
    ROW_COUNT=$(sudo -u $PG_USER psql -d $DB_NAME -t -c "
        SELECT
            (SELECT COUNT(*) FROM memories) +
            (SELECT COUNT(*) FROM agents) +
            (SELECT COUNT(*) FROM rooms) as total_rows;
    " | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    if [ "$ROW_COUNT" -eq 0 ]; then
        print_success "Database cleanup verified - all data removed"
    else
        print_warning "Some data may still exist - total rows: $ROW_COUNT"
    fi
}

# Main execution
main() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  ElizaOS Database Cleaner"
    echo -e "${BLUE}================================${NC}"
    echo

    print_status "Checking PostgreSQL connection..."
    check_postgres
    print_success "PostgreSQL is accessible"

    print_status "Checking database '$DB_NAME'..."
    check_database
    print_success "Database exists"

    clean_database
    verify_cleanup

    echo
    print_success "Database cleanup completed!"
    print_status "Your elizaos_db is now clean and ready for fresh data"
    echo
    print_status "To start your agent with clean database:"
    echo "  npm run start"
}

# Run main function
main "$@"