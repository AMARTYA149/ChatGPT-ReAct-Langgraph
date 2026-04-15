import "dotenv/config";
import { ChatGroq } from "@langchain/groq";
import { createAgent } from "langchain";
import { TavilySearch } from "@langchain/tavily";
import * as z from "zod";
import { tool } from "langchain"
import { writeFileSync } from "node:fs";
import readline from "node:readline/promises";
import { MemorySaver } from "@langchain/langgraph";

async function main() {
    const model = new ChatGroq({
        model: "openai/gpt-oss-120b",
        temperature: 0
    });

    const search = new TavilySearch({
        maxResults: 3,
        topic: "general",
    });

    const calendarEvents = tool(
        async ({ query }) => {
            // Google calendar logic goes here

            return JSON.stringify([{
                title: "Meeting with Swati",
                time: "2 pm",
                location: "Gmeet"
            }])
        },
        {
            name: 'get-calendar-events',
            description: "Call to get the calendar events",
            search: z.object({
                query: z.string().describe('The query to use in calendar eventd search!')
            })
        }

    )

    const checkpointer = new MemorySaver();

    const agent = createAgent({
        model,
        tools: [search, calendarEvents],
        checkpointer: checkpointer
    });


    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    while (true) {

        const userQuery = await rl.question("You: ");
        if (userQuery === '/bye') {
            break;
        }
        const result = await agent.invoke(
        {
            messages: [
                {
                    role: 'system',
                    content: `You are personal assistant. Use provided tools to get the information if you don't have it. Current date and time: ${new Date().toUTCString()}`
                },
                {
                    role: 'user',
                    content: userQuery
                }
            ],
            }, {
            configurable: { thread_id: 1 }
        }
    );

        console.log("Assistant: ", result.messages[result.messages.length - 1].content);
    }

    rl.close();

    const drawableGraphState = await agent.getGraphAsync();
    const graphStateImage = await drawableGraphState.drawMermaidPng();
    const graphStateArrayBuffer = await graphStateImage.arrayBuffer();

    const filePath = './graphState.png';
    writeFileSync(filePath, new Uint8Array(graphStateArrayBuffer));
}

main()