# Database Schema API with Bun

This project provides a Bun-powered API that extracts database schema information and uses LLMs to convert natural language questions into SQL queries.

## Features

-   REST API endpoints for database schema information
-   Natural language to SQL conversion
-   Built with Bun for high performance

## Setup

1. Make sure you have Bun installed. If not, you can install it from [https://bun.sh/](https://bun.sh/)

2. Install dependencies:

    ```
    bun install
    ```

3. Set your GROQ API key as an environment variable:

    ```
    export GROQ_API_KEY=your-api-key-here
    ```

    On Windows:

    ```
    set GROQ_API_KEY=your-api-key-here
    ```

## Running the Server

Start the server with:

```
bun run server.ts
```

The server will be available at http://localhost:3001

## Available Endpoints

### Health Check

```
GET /health
```

Returns "OK" if the server is running.

### Get Database Schema

```
GET /api/schema
```

Returns the complete database schema information.

### Query Database with Natural Language

```
POST /chat/completions
Content-Type: application/json

{
  "question": "How many users are in the database?"
}
```

The API will:

1. Convert the natural language question to a SQL query
2. Execute the query against your database
3. Return a natural language response

## Example Usage

```bash
# Get database schema
curl http://localhost:3000/api/schema

# Query the database
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"question":"How many events are there in Lucknow?"}'
```
