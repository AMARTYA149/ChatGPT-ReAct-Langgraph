/* 
Build in LLM
Build the graph
Invoke the agent
Add the memory
 */

import { ChatGroq } from "@langchain/groq";
import { tool } from "langchain"
import { TavilySearch } from "@langchain/tavily";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import * as z from "zod";

/** Tools */
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

const tools = [search, calendarEvents];
const toolNode = new ToolNode(tools);

// initialise the LLM
const llm = new ChatGroq({
    model: "openai/gpt-oss-120b",
    temperature: 0
}).bindTools(tools);

/**
 * Build the node
 */
async function callModel(state) {
    // Call the llm
    console.log("Calling the llm");
    const response = await llm.invoke(state.messages);
    // console.log("Response in callModel: ", response);

    return {messages: [response]};
}

/**
 * Conditional Edge
 */
function shouldContinue(state){

    /**
     * Here we can control the flow as per usecase, applying the guardrails, handling security, etc
     */

    /**
     * Check the previous ai message if tool call, return "tools", else return "__end__"
     */
    // console.log("messages: ", state.messages);
    const lastMessage = state.messages[state.messages.length - 1];

    if(lastMessage.tool_calls?.length){
        return 'tools';
    }

    return "__end__";
}

const graph = new StateGraph(MessagesAnnotation)
.addNode("llm", callModel)
.addNode("tools", toolNode)
.addEdge("__start__", "llm")
.addEdge("tools", "llm")
.addConditionalEdges("llm", shouldContinue)

const app = graph.compile();

async function main(){
    const result = await app.invoke({
        messages: [{role: 'user', content: 'What is the current weather in Moscow?'}]
    })

    const message = result.messages;
    const final = message[message.length - 1];

    console.log("AI: ", final.content)

}

main();