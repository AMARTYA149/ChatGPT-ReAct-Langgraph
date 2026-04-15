import "dotenv/config";
import { ChatGroq } from "@langchain/groq";
import { createAgent } from "langchain";
import { TavilySearch } from "@langchain/tavily";
import * as z from "zod";
import { tool } from "langchain"

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

    const agent = createAgent({
        model,
        tools: [search, calendarEvents],
    });


    const result = await agent.invoke(
        {
            messages: [
                {
                    role: 'system',
                    content: `You are personal assistant. Use provided tools to get the information if you don't have it. Current data and time: ${new Date().toUTCString()}`
                },
                {
                    role: 'user',
                    content: "When was Dhurandhar 2 was launched?"
                }
            ],
        }
    );

    console.log("Assistant: ", result.messages[result.messages.length - 1].content);
}

main()