import { ChatGroq } from "@langchain/groq";
import { pool } from "./db-schema";
import { ANALYSIS_SYSTEM_PROMPT } from "./analysis-prompt";

const llm = new ChatGroq({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    apiKey: process.env.GROQ_API_KEY,
});

export async function generateAnalysisReport(
    startDate: string,
    endDate: string,
    client_id: string
): Promise<string> {
    try {
        // Query to get aggregated data for the specified time period
        const query = `
            WITH event_counts AS (
                SELECT 
                    COALESCE(e.event_type, 'unknown') as event_type,
                    COALESCE(e.browser, 'unknown') as browser,
                    COALESCE(e.os, 'unknown') as os,
                    COALESCE(e.device_type, 'unknown') as device_type,
                    COALESCE(e.path, 'unknown') as path,
                    COUNT(*) as count
                FROM events e
                WHERE 
                    e.created_at BETWEEN $1 AND $2
                    AND e.client_id = $3
                GROUP BY e.event_type, e.browser, e.os, e.device_type, e.path
            )
            SELECT 
                (SELECT COUNT(*) FROM events e WHERE e.created_at BETWEEN $1 AND $2 AND e.client_id = $3) as total_events,
                (SELECT COUNT(DISTINCT e.session_id) FROM events e WHERE e.created_at BETWEEN $1 AND $2 AND e.client_id = $3) as total_sessions,
                (SELECT COUNT(DISTINCT e.user_id) FROM events e WHERE e.created_at BETWEEN $1 AND $2 AND e.client_id = $3) as total_users,
                (SELECT COUNT(DISTINCT e.anonymous_id) FROM events e WHERE e.created_at BETWEEN $1 AND $2 AND e.client_id = $3) as total_anonymous_users,
                (SELECT jsonb_object_agg(event_type, count) FROM event_counts) as event_type_distribution,
                (SELECT jsonb_object_agg(browser, count) FROM event_counts) as browser_distribution,
                (SELECT jsonb_object_agg(os, count) FROM event_counts) as os_distribution,
                (SELECT jsonb_object_agg(device_type, count) FROM event_counts) as device_distribution,
                (SELECT jsonb_object_agg(path, count) FROM event_counts) as path_distribution,
                (SELECT AVG(EXTRACT(EPOCH FROM (s.last_seen - s.first_seen))) 
                 FROM events e 
                 LEFT JOIN sessions s ON e.session_id = s.id 
                 WHERE e.created_at BETWEEN $1 AND $2 AND e.client_id = $3) as avg_session_duration
        `;

        const result = await pool.query(query, [startDate, endDate, client_id]);
        const data = result.rows[0];

        // Generate the analysis report using the LLM
        const prompt = `${ANALYSIS_SYSTEM_PROMPT}

Time Period: ${startDate} to ${endDate}

Data Summary:
${JSON.stringify(data, null, 2)}

Please generate a comprehensive analysis report based on this data. Include:
1. Executive Summary
2. Key Metrics and Trends
3. Detailed Analysis
4. Actionable Recommendations
5. Future Predictions

Focus on providing specific, data-driven insights and concrete recommendations.`;

        const response = await llm.invoke(prompt);
        return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    } catch (error) {
        console.error("Error generating analysis report:", error);
        throw new Error("Failed to generate analysis report");
    }
} 