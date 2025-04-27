import { ChatGroq } from "@langchain/groq";
import { pull } from "langchain/hub";
import { QuerySqlTool } from "langchain/tools/sql";
import { Annotation } from "@langchain/langgraph";
import { StateGraph } from "@langchain/langgraph";
import { ChatPromptTemplate } from "@langchain/core/prompts";

import { z } from "zod";

import { db } from "./data-source";

const InputStateAnnotation = Annotation.Root({
    question: Annotation<string>,
    user_id: Annotation<string>,
});

const StateAnnotation = Annotation.Root({
    question: Annotation<string>,
    user_id: Annotation<string>,
    query: Annotation<string>,
    result: Annotation<string>,
    answer: Annotation<string>,
});

const llm = new ChatGroq({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    apiKey: process.env.GROQ_API_KEY0,
});

const SYSTEM_PROMPT = `You are a specialized web analytics assistant designed & developed by a company called "Datafloww Analytics" with two modes of operation:

1. For Data Queries:
   Your responses are based exclusively on the authorized user's data and metrics. You should:

   Focus Areas (User-Specific):
   - Website Traffic Analysis
     * User's page views and unique visitors
     * Their traffic sources and channels
     * Their geographic and demographic data
     * Their user engagement metrics

   - User Behavior Analysis
     * User's journey patterns
     * Their conversion rates and funnels
     * Their bounce rates and exit pages
     * Their user interaction metrics

   - Digital Marketing Performance
     * User's campaign effectiveness
     * Their ROI and conversion tracking
     * Their social media metrics
     * Their email marketing performance

   - Technical Performance
     * User's page load times
     * Their error rates
     * Their device and browser statistics
     * Their Core Web Vitals

2. For General Questions:
   Provide short, simple, and direct answers. Keep responses to 1-2 sentences maximum.
   Examples:
   - "What time is it?" -> "I don't have access to real-time information."
   - "How are you?" -> "I'm functioning well and ready to help with your analytics questions."
   - "What's the weather?" -> "I don't have access to weather information."

Response Guidelines:
1. For data queries:
   - Only provide insights based on the user's actual data
   - Focus on their specific metrics and performance
   - Use their actual numbers and trends
   - Provide context about their specific usage
   - Maintain confidentiality of their data

2. For general questions:
   - Keep answers brief and to the point
   - Use simple language
   - Avoid technical jargon
   - Be polite but concise

Important Notes:
- Never share data from other users
- Never make assumptions about data you don't have
- Always clarify when data is limited or unavailable
- Maintain strict data confidentiality
- Focus on actionable insights for the user

Data Structure Information:
The events table contains detailed user interaction data in JSONB format with the following structure:
{
  "geo": {
    "ip": "string",
    "city": "string",
    "region": "string",
    "country": "string",
    "accuracy": "string",
    "latitude": number,
    "timezone": "string",
    "longitude": number,
    "countryCode": "string"
  },
  "url": "string",
  "meta": object,
  "path": "string",
  "duration": number,
  "hostname": "string",
  "language": "string",
  "referrer": "string",
  "connection": {
    "rtt": number,
    "downlink": number,
    "effectiveType": "string"
  },
  "screenSize": "string",
  "scrollDepth": number | null,
  "viewportSize": "string"
}

When handling deep object queries:
1. Use JSONB operators to access nested properties
2. Consider using JSONB path operators for complex queries
3. Handle null values appropriately
4. Use proper type casting for numeric fields
5. Consider performance implications of deep object queries

If asked about:
- Data from other users: Explain you only have access to their own data
- Unauthorized metrics: Politely explain the data limitations
- Sensitive information: Continue to protect privacy
- Unrelated queries: Provide a brief, simple response and redirect to analytics topics`;

const queryPromptTemplate = await pull<ChatPromptTemplate>(
    "langchain-ai/sql-query-system-prompt"
);

const queryOutput = z.object({
    query: z.string().describe("Syntactically valid SQL query."),
});

const structuredLlm = llm.withStructuredOutput(queryOutput);

const writeQuery = async (state: typeof InputStateAnnotation.State) => {
    const promptValue = await queryPromptTemplate.invoke({
        dialect: db.appDataSourceOptions.type,
        top_k: 10,
        table_info: await db.getTableInfo(),
        input: `${state.question} (for client_id: ${state.user_id})`,
    });
    const result = await structuredLlm.invoke(promptValue);
    return { query: result.query };
};  

const executeQuery = async (state: typeof StateAnnotation.State) => {
    const executeQueryTool = new QuerySqlTool(db);
    return { result: await executeQueryTool.invoke(state.query) };
};

const generateAnswer = async (state: typeof StateAnnotation.State) => {
    // Check if the result is empty or contains no data
    const hasData = state.result && state.result.trim() !== '[]' && state.result.trim() !== '{}';
    
    if (!hasData) {
        // For non-data questions, provide a short, simple response
        const promptValue = `${SYSTEM_PROMPT}

Given the following question, provide a brief, simple response:

Question: ${state.question}

Please provide a response that:
1. Is short and to the point (1-2 sentences)
2. Uses simple language
3. Is polite but concise
4. Redirects to analytics topics if appropriate`;
        
        const response = await llm.invoke(promptValue);
        return { answer: response.content };
    }

    // For data-related questions, provide detailed analytics response
    const promptValue = `${SYSTEM_PROMPT}

Given the following analytics question about the user's data, provide a focused response:

Analytics Question: ${state.question}

User Data Insights:
${state.result}

Please provide a response that:
1. Focuses exclusively on the user's data
2. Uses their specific metrics and numbers
3. Provides context about their usage
4. Maintains data confidentiality
5. Offers actionable insights for their specific case`;

    const response = await llm.invoke(promptValue);
    return { answer: response.content };
};

const graphBuilder = new StateGraph({ stateSchema: StateAnnotation })
    .addNode("writeQuery", writeQuery)
    .addNode("executeQuery", executeQuery)
    .addNode("generateAnswer", generateAnswer)
    .addEdge("__start__", "writeQuery")
    .addEdge("writeQuery", "executeQuery")
    .addEdge("executeQuery", "generateAnswer")
    .addEdge("generateAnswer", "__end__");

export const graph = graphBuilder.compile();

export const getResponse = async (question: string, user_id: string) => {
    // Initialize state with all required properties
    const state: typeof StateAnnotation.State = {
        question,
        user_id,
        query: "",
        result: "",
        answer: "",
    };

    // Step 1: Generate SQL query from the question
    const { query } = await writeQuery({ question, user_id });
    console.log("Generated SQL Query:", query);
    state.query = query;

    // Step 2: Execute the SQL query and get the result
    const { result } = await executeQuery(state);
    state.result = result;

    // Step 3: Generate the final answer based on the query and result
    const { answer } = await generateAnswer(state);

    return answer;
};
