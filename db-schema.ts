import { Pool } from "pg";

// Create a database connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

/**
 * Fetches the database schema information in a format suitable for LLMs
 * @returns A string representation of the database schema
 */
export async function getDatabaseSchema(): Promise<string> {
    // Query to get tables
    const tablesQuery = `
    SELECT 
      table_name 
    FROM 
      information_schema.tables 
    WHERE 
      table_schema = 'public'
  `;

    const tablesResult = await pool.query(tablesQuery);
    const tables = tablesResult.rows.map((row) => row.table_name);

    let schemaInfo = "";

    // For each table, get its columns and constraints
    for (const table of tables) {
        // Get columns
        const columnsQuery = `
      SELECT 
        column_name, 
        data_type, 
        is_nullable
      FROM 
        information_schema.columns 
      WHERE 
        table_schema = 'public' AND 
        table_name = $1
      ORDER BY 
        ordinal_position
    `;

        const columnsResult = await pool.query(columnsQuery, [table]);

        // Get primary keys
        const pkQuery = `
      SELECT
        kcu.column_name as key_column
      FROM
        information_schema.table_constraints tco
      JOIN 
        information_schema.key_column_usage kcu
        ON kcu.constraint_name = tco.constraint_name
        AND kcu.constraint_schema = tco.constraint_schema
      WHERE
        tco.constraint_type = 'PRIMARY KEY'
        AND tco.table_name = $1
        AND tco.table_schema = 'public'
    `;

        const pkResult = await pool.query(pkQuery, [table]);
        const primaryKeys = pkResult.rows.map((row) => row.key_column);

        // Get foreign keys
        const fkQuery = `
      SELECT
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM 
        information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name=$1
    `;

        const fkResult = await pool.query(fkQuery, [table]);

        // Format table schema
        schemaInfo += `Table: ${table}\n`;
        schemaInfo += `Columns:\n`;

        for (const column of columnsResult.rows) {
            const isPK = primaryKeys.includes(column.column_name)
                ? " (PRIMARY KEY)"
                : "";
            const fk = fkResult.rows.find(
                (row) => row.column_name === column.column_name
            );
            const fkInfo = fk
                ? ` (FOREIGN KEY to ${fk.foreign_table_name}.${fk.foreign_column_name})`
                : "";

            schemaInfo += `  - ${column.column_name} (${
                column.data_type
            })${isPK}${fkInfo} ${
                column.is_nullable === "YES" ? "NULL" : "NOT NULL"
            }\n`;
        }

        schemaInfo += `\n`;
    }

    return schemaInfo;
}

// Export the pool for use in other files
export { pool };
