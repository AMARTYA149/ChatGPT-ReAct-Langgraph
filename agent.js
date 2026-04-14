import "dotenv/config";
import { ChatGroq } from "@langchain/groq";
import { createAgent } from "langchain";
import { TavilySearch } from "@langchain/tavily";

async function main() {
    const model = new ChatGroq({
        model: "openai/gpt-oss-120b",
        temperature: 0
    });

    const search = new TavilySearch({
        maxResults: 3,
        topic: "general",
    });

    const agent = createAgent({
        model,
        tools: [search],
    });


    const result = await agent.invoke(
        {
            messages: [
                {
                    role: 'user',
                    content: "How is the weather in bangalore now?"
                }
            ],
        }
    );

    console.log("Assistant: ", result.messages[result.messages.length - 1].content);
}

main()