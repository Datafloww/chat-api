import { getResponse } from "./groq";
import { serve } from "bun";
import { getDatabaseSchema } from "./db-schema";
import { generateAnalysisReport } from "./analysis-report";

// Set environment variables if needed
// process.env.GROQ_API_KEY = "your-api-key";
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "http://localhost:5173";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*"
};

// Define the server
const server = serve({
    port: 3001,
    async fetch(req) {
        const url = new URL(req.url);

        // Handle preflight CORS requests
        if (req.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: CORS_HEADERS,
            });
        }

        // Health check endpoint
        if (url.pathname === "/health") {
            return new Response("OK", { status: 200, headers: CORS_HEADERS });
        }

        // Schema endpoint - returns the database schema
        if (url.pathname === "/api/schema" && req.method === "GET") {
            try {
                const schema = await getDatabaseSchema();
                return new Response(JSON.stringify({ schema }), {
                    status: 200,
                    headers: {
                        ...CORS_HEADERS,
                        "Content-Type": "application/json",
                    },
                });
            } catch (error) {
                console.error("Error fetching schema:", error);
                return new Response(
                    JSON.stringify({
                        error: "Failed to fetch database schema",
                    }),
                    {
                        status: 500,
                        headers: {
                            ...CORS_HEADERS,
                            "Content-Type": "application/json",
                        },
                    }
                );
            }
        }

        // SQL query endpoint
        if (url.pathname === "/chat/completions" && req.method === "POST") {
            try {
                // Parse the JSON body
                const body = await req.json();

                // Check if the question property exists
                if (!body.messages[0].content) {
                    return new Response(
                        JSON.stringify({
                            error: "Missing 'messages' property in request body",
                        }),
                        {
                            status: 400,
                            headers: {
                                ...CORS_HEADERS,
                                "Content-Type": "application/json",
                            },
                        }
                    );
                }

                // Check if user_id exists
                // if (!body.user_id) {
                //     return new Response(
                //         JSON.stringify({
                //             error: "Missing 'user_id' property in request body",
                //         }),
                //         {
                //             status: 400,
                //             headers: { "Content-Type": "application/json" },
                //         }
                //     );
                // }

                // Get response using the getResponse function from groq.ts
                const answer = await getResponse(
                    body.messages[body.messages.length - 1].content,
                    body.user_id
                );

                // Return the answer as JSON
                return new Response(
                    JSON.stringify({
                        question:
                            body.messages[body.messages.length - 1].content,
                        answer: answer,
                    }),
                    {
                        status: 200,
                        headers: {
                            ...CORS_HEADERS,
                            "Content-Type": "application/json",
                        },
                    }
                );
            } catch (error) {
                console.error("Error processing request:", error);
                return new Response(
                    JSON.stringify({ error: "Failed to process request" }),
                    {
                        status: 500,
                        headers: {
                            ...CORS_HEADERS,
                            "Content-Type": "application/json",
                        },
                    }
                );
            }
        }

        // Analysis report endpoint
        if (url.pathname === "/api/analysis" && req.method === "POST") {
            try {
                const body = await req.json();
                
                // Validate required fields
                if (!body.startDate || !body.endDate || !body.client_id) {
                    return new Response(
                        JSON.stringify({
                            error: "Missing required fields: startDate, endDate, client_id",
                        }),
                        {
                            status: 400,
                            headers: {
                                ...CORS_HEADERS,
                                "Content-Type": "application/json",
                            },
                        }
                    );
                }

                // Generate the analysis report
                const report = await generateAnalysisReport(
                    body.startDate,
                    body.endDate,
                    body.client_id
                );

                // Return the report as JSON
                return new Response(
                    JSON.stringify({
                        report,
                        startDate: body.startDate,
                        endDate: body.endDate,
                    }),
                    {
                        status: 200,
                        headers: {
                            ...CORS_HEADERS,
                            "Content-Type": "application/json",
                        },
                    }
                );
            } catch (error) {
                console.error("Error generating analysis report:", error);
                return new Response(
                    JSON.stringify({ error: "Failed to generate analysis report" }),
                    {
                        status: 500,
                        headers: {
                            ...CORS_HEADERS,
                            "Content-Type": "application/json",
                        },
                    }
                );
            }
        }

        // Handle 404 for any other routes
        return new Response("Not Found", {
            status: 404,
            headers: CORS_HEADERS,
        });
    },
});

console.log(`Server running at http://localhost:${server.port}`);
