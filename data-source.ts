import { SqlDatabase } from "langchain/sql_db";
import { DataSource } from "typeorm";

const datasource = new DataSource({
    type: "postgres",
    url: process.env.DATABASE_URL,
});

export const db = await SqlDatabase.fromDataSourceParams({
    appDataSource: datasource,
});
