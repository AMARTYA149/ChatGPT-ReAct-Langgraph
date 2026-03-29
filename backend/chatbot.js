import "dotenv/config";
import { tavily } from "@tavily/core";
import OpenAI from "openai";
import NodeCache from "node-cache";
// import readline from 'node:readline/promises'

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
const apiKey = process.env.GROQ_API_KEY;
const cache = new NodeCache({stdTTL: 60 * 60 * 24}); //24 hours

const groq = new OpenAI({
    apiKey: apiKey,
    baseURL: "https://api.groq.com/openai/v1",
});

export async function generate(userMessage, threadId) {


    const baseMessages = [
        {
            //Setting persona of the llm agent
            role: "system",
            content: `You are a smart personal assistant.
                    •If you know the answer to a question, answer it directly in plain English.
                    •If the answer requires real-time, local, or up-to-date information, or if you don't know the answer, use the available tools to find it.
                    •You have access to the following tool:
                    webSearch(query: string): Use this to search the internet for current or unknown information.
                    •Decide when to use your own knowledge and when to use the tool.
                    Do not mention the tool unless needed.
                    Examples:
                    Q: What is the capital of France?
                    A: The capital of France is Paris.
                    Q: What's the weather in Mumbai right now?
                    A: (use the search tool to find the latest weather)
                    Q: Who is the Prime Minister of India?
                    A: The current Prime Minister of India is Narendra Modi.
                    Q: Tell me the latest IT news.
                    A: (use the search tool to get the latest news)
                    current date and time: ${new Date().toUTCString()}`,
        }
        // {
        //   role: "user",
        //   content: "What is the weather in Manali?",
        // },
    ];

    const messages = cache.get(threadId) ?? baseMessages;

    messages.push({
        role: "user",
        content: userMessage
    });

    const MAX_RETRIES = 10;
    let count = 0;

    while (true) {
        if(count > MAX_RETRIES){
            return "I could not find the response, please try again!";
        }

        count++;
        const completions = await groq.chat.completions.create({
            temperature: 0,
            // frequency_penalty: 1,
            // response_format: { type: 'json_object' },
            model: "llama-3.3-70b-versatile",
            messages: messages,
            tools: [
                // Sample request body with tool definitions and messages
                {
                    type: "function",
                    function: {
                        name: "webSearch",
                        description:
                            "Search the latest information and realtime data on the internet",
                        parameters: {
                            // JSON Schema object
                            type: "object",
                            properties: {
                                query: {
                                    type: "string",
                                    description: "The search query to perform search on",
                                },
                            },
                            required: ["query"],
                        },
                    },
                },
            ],
            tool_choice: "auto",
            parallel_tool_calls: false
        });

        messages.push(completions.choices[0].message);
        // console.log(`Messages ${messages}`);

        const toolCalls = completions.choices[0].message.tool_calls;

        if (!toolCalls) {
            //here we end the chatbot response
            cache.set(threadId, messages);
            // console.log(JSON.stringify(cache.data));
            return completions.choices[0].message.content;
        }

        for (const tool of toolCalls) {
            //   console.log(`tool:`, tool);
            const functionName = tool.function.name;
            const functionParams = tool.function.arguments;

            if (functionName === "webSearch") {
                const toolResult = await webSearch(JSON.parse(functionParams));
                // console.log(`ToolResult: `, toolResult);

                messages.push({
                    tool_call_id: tool.id,
                    role: "tool",
                    name: functionName,
                    content: toolResult,
                });
            }
        }

       
    }


    //   rl.close();
}

async function webSearch({ query }) {
    // Here we will do tavily api call

    console.log(`Calling web search...`);

    const response = await tvly.search(query);
    // console.log(`Response: `, response);

    const finalResult = response.results
        .map((result) => result.content)
        .join("\n\n");

    return finalResult;
}
