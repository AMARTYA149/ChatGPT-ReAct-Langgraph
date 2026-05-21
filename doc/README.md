# graph.js — Custom LangGraph ReAct Agent (Manual Graph Construction)

This document is a deep-dive into `graph.js`, which builds a **ReAct agent from scratch** using LangGraph's low-level `StateGraph` API — as opposed to `agent.js` which uses the high-level `createAgent()` helper.

---

## Table of Contents

- [Why This File Matters](#why-this-file-matters)
- [Architecture](#architecture)
- [Complete Code Walkthrough](#complete-code-walkthrough)
  - [1. Imports](#1-imports)
  - [2. Checkpointer (Memory)](#2-checkpointer-memory)
  - [3. Tool Definitions](#3-tool-definitions)
  - [4. ToolNode](#4-toolnode)
  - [5. LLM Initialization & Tool Binding](#5-llm-initialization--tool-binding)
  - [6. Graph Nodes](#6-graph-nodes)
  - [7. Conditional Edge Logic](#7-conditional-edge-logic)
  - [8. Graph Construction](#8-graph-construction)
  - [9. Graph Compilation](#9-graph-compilation)
  - [10. Main Loop](#10-main-loop)
- [Execution Flow (Step-by-Step)](#execution-flow-step-by-step)
- [agent.js vs graph.js — Key Differences](#agentjs-vs-graphjs--key-differences)
- [Key Concepts for Interviews](#key-concepts-for-interviews)
- [Interview Q&A](#interview-qa)

---

## Why This File Matters

`agent.js` uses `createAgent()` which hides all the graph-building internals. `graph.js` **manually constructs the same ReAct agent** using `StateGraph`, giving you full control over:

- How nodes are defined
- How edges (including conditional edges) route execution
- Where to inject guardrails, logging, or custom logic
- How state flows through the graph

This is the approach you'd use in production when you need customization beyond what `createAgent()` offers.

---

## Architecture

```
                    ┌──────────┐
                    │ __start__│
                    └────┬─────┘
                         │
                         ▼
                  ┌─────────────┐
             ┌───►│  llm (node) │◄────┐
             │    └──────┬──────┘     │
             │           │            │
             │    shouldContinue()    │
             │      ╱         ╲       │
             │   "tools"    "__end__" │
             │     │           │      │
             │     ▼           ▼      │
             │  ┌───────┐  ┌──────┐  │
             └──┤ tools  │  │ END  │  │
                │ (node) │  └──────┘  │
                └────────┘            │
```

### Data Flow

```
User Input
    → MessagesAnnotation state { messages: [...] }
        → llm node (calls Groq LLM)
            → shouldContinue() checks for tool_calls
                → If tool_calls: route to tools node → execute tool → return to llm
                → If no tool_calls: route to END → return response
```

---

## Complete Code Walkthrough

### 1. Imports

```js
import readline from 'node:readline/promises';
import { ChatGroq } from "@langchain/groq";
import { tool } from "langchain";
import { TavilySearch } from "@langchain/tavily";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MessagesAnnotation, StateGraph, END } from "@langchain/langgraph";
import * as z from "zod";
import { printGraph } from "./utils.js";
import { MemorySaver } from "@langchain/langgraph";
```

| Import | Purpose |
|---|---|
| `readline` | Interactive CLI input/output |
| `ChatGroq` | LLM provider (Groq inference) |
| `tool` | Factory to create custom tools with schemas |
| `TavilySearch` | Pre-built web search tool |
| `ToolNode` | Pre-built graph node that executes tools |
| `MessagesAnnotation` | Built-in state schema for message-based agents |
| `StateGraph` | Core class to build a directed graph |
| `END` | Special constant representing the terminal node |
| `z` (Zod) | Schema validation for tool inputs |
| `printGraph` | Utility to export the graph as a PNG |
| `MemorySaver` | In-memory checkpointer for conversation state |

---

### 2. Checkpointer (Memory)

```js
const checkpointer = new MemorySaver();
```

- Stores the full graph state (all messages, tool calls, results) in memory.
- Keyed by `thread_id` — each thread has its own conversation history.
- Enables the agent to remember previous exchanges within a session.

---

### 3. Tool Definitions

#### TavilySearch

```js
const search = new TavilySearch({
    maxResults: 3,
    topic: "general",
});
```

A pre-built tool that calls the Tavily API for real-time web search. The LLM invokes this when it needs current information.

#### Custom Calendar Tool

```js
const calendarEvents = tool(
    async ({ query }) => {
        return JSON.stringify([{
            title: "Meeting with Swati",
            time: "2 pm",
            location: "Gmeet"
        }]);
    },
    {
        name: 'get-calendar-events',
        description: "Call to get the calendar events",
        search: z.object({
            query: z.string().describe('The query to use in calendar event search!')
        })
    }
);
```

- **Handler**: The async function that runs when the tool is called. Currently returns mock data.
- **Name & Description**: The LLM reads these to decide when to invoke the tool.
- **Schema (Zod)**: Defines the expected input shape. The LLM generates arguments matching this schema.

---

### 4. ToolNode

```js
const tools = [search, calendarEvents];
const toolNode = new ToolNode(tools);
```

`ToolNode` is a **pre-built LangGraph node** that:
1. Reads the last message's `tool_calls` array.
2. Matches each tool call to the correct tool by name.
3. Executes the tool with the provided arguments.
4. Returns a `ToolMessage` with the result appended to state.

This is one of the few "prebuilt" components used — the rest of the graph is manual.

---

### 5. LLM Initialization & Tool Binding

```js
const llm = new ChatGroq({
    model: "openai/gpt-oss-120b",
    temperature: 0
}).bindTools(tools);
```

**`.bindTools(tools)`** is critical — it:
1. Converts each tool's Zod schema into a JSON Schema.
2. Injects tool descriptions into every LLM call as available functions.
3. Enables the LLM to output structured `tool_calls` in its response.

Without `bindTools()`, the LLM wouldn't know any tools exist.

> **Note**: In `agent.js`, `createAgent()` handles `bindTools()` internally. Here we do it explicitly.

---

### 6. Graph Nodes

```js
async function callModel(state) {
    console.log("Calling the llm");
    const response = await llm.invoke(state.messages);
    return { messages: [response] };
}
```

This is the **LLM node** function. It:
1. Receives the current graph state (which includes all messages so far).
2. Sends the messages to the LLM.
3. Returns the LLM's response wrapped in `{ messages: [response] }`.

The returned object is **merged into state** — `MessagesAnnotation` appends new messages to the existing array (it doesn't replace them).

---

### 7. Conditional Edge Logic

```js
function shouldContinue(state) {
    const lastMessage = state.messages[state.messages.length - 1];

    if (lastMessage.tool_calls?.length) {
        return 'tools';
    }

    return "__end__";
}
```

This is the **routing function** that decides what happens after the LLM responds:

| Condition | Route | Effect |
|---|---|---|
| `tool_calls` present | `"tools"` | Execute the requested tool(s) |
| No `tool_calls` | `"__end__"` | End the graph, return the response |

**This is where you add guardrails in production:**
- Block certain tool calls
- Add rate limiting
- Validate/sanitize tool arguments
- Implement human-in-the-loop approval

---

### 8. Graph Construction

```js
const graph = new StateGraph(MessagesAnnotation)
    .addNode("llm", callModel)
    .addNode("tools", toolNode)
    .addEdge("__start__", "llm")
    .addEdge("tools", "llm")
    .addConditionalEdges("llm", shouldContinue, {
        __end__: END,
        tools: 'tools'
    });
```

Line-by-line breakdown:

| Line | What It Does |
|---|---|
| `new StateGraph(MessagesAnnotation)` | Creates a graph with message-based state (array of messages) |
| `.addNode("llm", callModel)` | Registers the LLM node |
| `.addNode("tools", toolNode)` | Registers the tool execution node |
| `.addEdge("__start__", "llm")` | Entry point: always go to LLM first |
| `.addEdge("tools", "llm")` | After tool execution, always return to LLM |
| `.addConditionalEdges(...)` | After LLM, run `shouldContinue()` to decide next step |

**The third argument to `addConditionalEdges`** is a mapping from return values to node names:
- `"__end__"` → `END` (terminal node)
- `"tools"` → `"tools"` node

---

### 9. Graph Compilation

```js
const app = graph.compile({ checkpointer });
```

`compile()` transforms the graph definition into a **runnable application**:
- Validates the graph structure (no dangling edges, valid node references).
- Attaches the checkpointer for state persistence.
- Returns an invocable object with `.invoke()`, `.stream()`, etc.

---

### 10. Main Loop

```js
async function main() {
    const config = { configurable: { thread_id: "1" } };

    await printGraph(app, './customGraph.png');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    while (true) {
        const userInput = await rl.question("You: ");
        if (userInput === '/bye') break;

        const result = await app.invoke({
            messages: [{ role: 'user', content: userInput }]
        }, config);

        const message = result.messages;
        const final = message[message.length - 1];
        console.log("AI: ", final.content);
    }
    rl.close();
}
```

Key points:
- **`thread_id: "1"`** — scopes the conversation memory.
- **`printGraph()`** — exports the graph structure as a PNG before starting the chat.
- **`app.invoke()`** — runs the full graph to completion (all ReAct loops) and returns the final state.
- The **last message** in the result is always the agent's final answer.

---

## Execution Flow (Step-by-Step)

Example: User asks *"What's the weather in Delhi?"*

```
1. User types: "What's the weather in Delhi?"

2. __start__ → llm node
   - callModel() sends messages to Groq LLM
   - LLM response includes: tool_calls: [{name: "tavily_search", args: {query: "weather in Delhi"}}]

3. shouldContinue() checks → tool_calls exist → route to "tools"

4. tools node (ToolNode)
   - Executes TavilySearch with query "weather in Delhi"
   - Returns: ToolMessage with search results

5. tools → llm (fixed edge)
   - callModel() sends updated messages (now includes search results) to LLM
   - LLM formulates a natural language answer using the search data

6. shouldContinue() checks → no tool_calls → route to "__end__"

7. Graph returns final state with all messages
   - Last message: "The current weather in Delhi is 42°C and sunny."
```

---

## agent.js vs graph.js — Key Differences

| Aspect | `agent.js` (High-Level) | `graph.js` (Low-Level) |
|---|---|---|
| **Agent creation** | `createAgent()` | Manual `StateGraph` construction |
| **Tool binding** | Automatic (inside `createAgent`) | Explicit `.bindTools(tools)` |
| **Graph nodes** | Hidden | Manually defined (`callModel`, `toolNode`) |
| **Conditional edges** | Hidden | Explicit `shouldContinue()` function |
| **Customization** | Limited | Full control over nodes, edges, state |
| **Guardrails** | Hard to inject | Easy — modify `shouldContinue()` or add nodes |
| **System prompt** | Passed in `invoke()` messages | Not included (add to `callModel` if needed) |
| **Graph export** | After conversation ends | Before conversation starts |
| **Use case** | Quick prototyping | Production agents needing custom logic |

---

## Key Concepts for Interviews

### MessagesAnnotation

LangGraph's built-in state schema for chat-based agents. It defines the state as:

```ts
{ messages: BaseMessage[] }
```

Messages are **appended** (not replaced) when a node returns `{ messages: [...] }`. This is handled by the annotation's **reducer** — a merge function that combines old and new state.

### StateGraph vs createAgent

- `StateGraph` = **low-level** — you define every node, edge, and state transition.
- `createAgent()` = **high-level** — it builds a `StateGraph` internally with sensible defaults.
- Understanding `StateGraph` is essential because `createAgent()` is just a convenience wrapper.

### Node Functions

A node function must:
1. Accept the current **state** as its argument.
2. Return a **partial state update** (only the fields you want to modify).
3. The framework merges the return value into the existing state using reducers.

### Conditional Edges

```js
.addConditionalEdges(sourceNode, routerFunction, routeMap)
```

- `routerFunction` receives state and returns a **string key**.
- `routeMap` maps keys to destination node names.
- This is how the ReAct loop is created — the LLM's output determines whether to loop or stop.

### Tool Binding vs Tool Registration

| Concept | What It Does |
|---|---|
| `bindTools(tools)` | Tells the **LLM** about available tools (injected into context) |
| `new ToolNode(tools)` | Creates a **graph node** that can execute tools |
| Both are needed | LLM must know tools exist; runtime must be able to run them |

---

## Interview Q&A

### Q1: Why build the graph manually instead of using `createAgent()`?

**A:** Manual construction gives full control over the execution flow. You can:
- Add custom nodes (e.g., validation, logging, human approval).
- Modify routing logic in `shouldContinue()` for guardrails.
- Add parallel branches or sub-graphs.
- Implement custom state schemas beyond `MessagesAnnotation`.

`createAgent()` is great for prototyping, but production agents usually need this level of control.

### Q2: What is `MessagesAnnotation` and why is it used?

**A:** It's a pre-defined state schema that represents the conversation as an array of messages. Its **reducer** appends new messages instead of replacing the entire array. This ensures the full conversation history is preserved and grows with each node execution.

### Q3: Explain the difference between `addEdge` and `addConditionalEdges`.

**A:**
- `addEdge("A", "B")` — **Always** go from A to B. Deterministic.
- `addConditionalEdges("A", fn, map)` — After A, run `fn(state)` which returns a key. The `map` translates that key to the next node. This enables branching and loops.

### Q4: What does `.bindTools()` do internally?

**A:** It serializes each tool's name, description, and Zod schema into a JSON Schema format. This is attached to every LLM request as the `tools` parameter (following the OpenAI function-calling spec). The LLM can then respond with structured `tool_calls` instead of plain text.

### Q5: How does `ToolNode` know which tool to execute?

**A:** It reads `tool_calls` from the last AI message. Each tool call contains a `name` and `args`. `ToolNode` matches the name against its registered tools and invokes the matching one with the provided arguments. The result is returned as a `ToolMessage`.

### Q6: What would happen if you remove `addEdge("tools", "llm")`?

**A:** After executing a tool, the graph would have no outgoing edge from the `"tools"` node — it would stop immediately. The tool result would never be sent back to the LLM for interpretation, so the user would get no useful response.

### Q7: How would you add a guardrail to this graph?

**A:** Modify `shouldContinue()` to inspect and filter tool calls:

```js
function shouldContinue(state) {
    const lastMessage = state.messages[state.messages.length - 1];

    if (lastMessage.tool_calls?.length) {
        // Guardrail: block specific tools
        const blocked = lastMessage.tool_calls.some(tc => tc.name === 'dangerous-tool');
        if (blocked) return "__end__";

        return 'tools';
    }
    return "__end__";
}
```

Or add a new **validation node** between `llm` and `tools` for more complex checks.

### Q8: What is `graph.compile()` and why is it separate from graph definition?

**A:** `compile()` finalizes the graph:
1. Validates structure (no broken edges, all nodes reachable).
2. Attaches middleware (checkpointer, interrupt points).
3. Returns a **runnable** with `.invoke()`, `.stream()`, `.batch()`.

Separating definition from compilation follows the builder pattern — you can construct the graph incrementally and only validate once at the end.

### Q9: How does state management work in this graph?

**A:**
1. **Initial state**: `{ messages: [userMessage] }` passed to `app.invoke()`.
2. **After LLM node**: LLM response appended → `{ messages: [userMessage, aiMessage] }`.
3. **After tools node**: Tool result appended → `{ messages: [userMessage, aiMessage, toolMessage] }`.
4. **On loop back**: LLM sees all messages including tool results.
5. **Checkpointer** saves state after each node, keyed by `thread_id`.

### Q10: How is this different from a simple while-loop agent?

**A:**
| While-Loop Agent | StateGraph Agent |
|---|---|
| Linear, imperative control flow | Declarative graph-based flow |
| Hard to visualize | Auto-generates execution diagrams |
| No built-in state persistence | Checkpointer saves state at each step |
| Difficult to add branching | Conditional edges enable complex routing |
| No interruption support | Supports human-in-the-loop interrupts |
| Tightly coupled logic | Modular (add/remove/swap nodes) |

---

## utils.js — Graph Visualization Helper

```js
import { writeFileSync } from "node:fs";

export async function printGraph(agent, graphPath) {
    const drawableGraphState = await agent.getGraphAsync();
    const graphStateImage = await drawableGraphState.drawMermaidPng();
    const graphStateArrayBuffer = await graphStateImage.arrayBuffer();
    writeFileSync(graphPath, new Uint8Array(graphStateArrayBuffer));
}
```

Exports the compiled graph as a Mermaid diagram PNG. The output (`customGraph.png`) visualizes the exact nodes and edges of the agent.

---

## Key Takeaways

1. **`StateGraph`** is the foundational API — `createAgent()` is just a wrapper around it.
2. **Nodes** are functions that take state and return partial state updates.
3. **Conditional edges** create the ReAct loop — routing based on whether the LLM wants to call a tool.
4. **`bindTools()`** tells the LLM about tools; **`ToolNode`** executes them — both are required.
5. **`shouldContinue()`** is the control point for guardrails, validation, and custom routing.
6. **`MessagesAnnotation`** uses a reducer that appends messages, preserving full conversation history.
7. **`compile()`** turns a graph definition into a runnable, attaching checkpointers and validation.
8. Manual graph construction is preferred in production for maximum customization and control.
