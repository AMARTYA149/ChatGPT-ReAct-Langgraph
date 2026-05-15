# ChatGPT ReAct Agent with LangGraph

A conversational AI personal assistant built with **LangGraph** and the **ReAct (Reasoning + Acting)** pattern. The agent uses an LLM (via Groq) augmented with tools — web search and a calendar — to answer user queries in an interactive CLI loop.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [How It Works](#how-it-works)
- [Key Concepts (Interview Prep)](#key-concepts-interview-prep)
  - [ReAct Pattern](#react-pattern)
  - [LangGraph & Agents](#langgraph--agents)
  - [Tool Calling](#tool-calling)
  - [Memory & Checkpointing](#memory--checkpointing)
  - [Graph Visualization](#graph-visualization)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Setup & Running](#setup--running)
- [Code Walkthrough](#code-walkthrough)
- [Interview Q&A](#interview-qa)

---

## Architecture Overview

```
┌─────────────┐
│   User CLI   │
└──────┬──────┘
       │ user query
       ▼
┌──────────────────────────────────────────────┐
│              LangGraph ReAct Agent            │
│                                              │
│   ┌────────┐    ┌───────────────────────┐    │
│   │  LLM   │◄──►│   Tool Executor       │    │
│   │ (Groq) │    │  ┌─────────────────┐  │    │
│   └────────┘    │  │ TavilySearch    │  │    │
│                 │  │ (Web Search)    │  │    │
│                 │  ├─────────────────┤  │    │
│                 │  │ CalendarEvents  │  │    │
│                 │  │ (Custom Tool)   │  │    │
│                 │  └─────────────────┘  │    │
│                 └───────────────────────┘    │
│                                              │
│   ┌──────────────────┐                       │
│   │  MemorySaver     │ (conversation state)  │
│   │  (Checkpointer)  │                       │
│   └──────────────────┘                       │
└──────────────────────────────────────────────┘
       │
       ▼
  Agent Response
```

## How It Works

1. The user types a query in the terminal.
2. The agent receives the query along with a **system prompt** that provides the current date/time and tool-use instructions.
3. The LLM **reasons** about whether it can answer directly or needs to call a tool.
4. If a tool is needed, the agent **acts** by invoking the appropriate tool (web search or calendar lookup).
5. The tool result is fed back to the LLM, which then formulates the final response.
6. Steps 3–5 may repeat multiple times (the ReAct loop) until the agent has enough information.
7. The response is printed, and the loop continues until the user types `/bye`.
8. On exit, the agent's execution graph is saved as a Mermaid diagram PNG (`graphState.png`).

---

## Key Concepts (Interview Prep)

### ReAct Pattern

**ReAct** stands for **Reasoning + Acting**. It is a prompting/agent paradigm where the LLM alternates between:

- **Thought** — reasoning about the current state and what to do next.
- **Action** — calling an external tool to gather information.
- **Observation** — processing the tool's output.

This loop continues until the LLM decides it has enough information to produce a final answer.

**Why it matters:**
- Overcomes the LLM's knowledge cutoff and hallucination issues by grounding responses in real-time tool outputs.
- Provides transparent, step-by-step reasoning that can be audited.
- More reliable than pure chain-of-thought because actions provide factual grounding.

**Paper:** [ReAct: Synergizing Reasoning and Acting in Language Models (Yao et al., 2022)](https://arxiv.org/abs/2210.03629)

---

### LangGraph & Agents

**LangGraph** is a framework for building stateful, multi-step AI agent workflows as **directed graphs**.

Key concepts:
| Concept | Description |
|---|---|
| **Node** | A processing step (e.g., LLM call, tool execution) |
| **Edge** | Connection between nodes defining execution flow |
| **Conditional Edge** | Routes execution based on LLM output (e.g., "call tool" vs. "return response") |
| **State** | Shared data that flows through the graph (messages, tool outputs, etc.) |
| **Checkpointer** | Persists state across invocations for memory |

In this project, `createAgent()` builds a ReAct graph with:
- An **LLM node** that decides the next action.
- A **Tool node** that executes the chosen tool.
- **Conditional edges** that route back to the LLM after tool execution or exit with the final answer.

```
        ┌────────────┐
        │   START    │
        └─────┬──────┘
              ▼
        ┌────────────┐
   ┌───►│  LLM Node  │◄───┐
   │    └─────┬──────┘    │
   │          │            │
   │    (tool call?)       │
   │     ╱        ╲        │
   │   Yes         No      │
   │    │           │      │
   │    ▼           ▼      │
   │ ┌──────┐  ┌───────┐  │
   └─┤ Tool │  │  END  │  │
     │ Node │  └───────┘  │
     └──┬───┘             │
        │ observation     │
        └─────────────────┘
```

---

### Tool Calling

Tools extend the LLM's capabilities beyond text generation. This project uses two tools:

#### 1. TavilySearch (Web Search)
```js
const search = new TavilySearch({
    maxResults: 3,
    topic: "general",
});
```
- Uses the [Tavily API](https://tavily.com/) for real-time web search.
- Returns up to 3 search results.
- Enables the agent to answer questions about current events, live data, etc.

#### 2. Custom Calendar Tool
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
        schema: z.object({
            query: z.string().describe('The query to use in calendar event search!')
        })
    }
);
```
- A **custom tool** defined using LangChain's `tool()` function.
- Uses **Zod** for input schema validation — the LLM knows what parameters to pass.
- Currently returns mock data; in production, this would connect to Google Calendar API.

**How the LLM decides which tool to call:**
The LLM receives tool descriptions and schemas as part of its context. Based on the user's query, it generates a structured **tool call** (function name + arguments). The framework intercepts this and routes execution to the matching tool.

---

### Memory & Checkpointing

```js
const checkpointer = new MemorySaver();
```

- `MemorySaver` provides **in-memory conversation persistence**.
- Each invocation uses `thread_id: 1` to maintain conversation context across turns.
- The checkpointer saves the full graph state (messages, tool calls, results) after each step.
- Enables **multi-turn conversations** where the agent remembers previous exchanges.

**In production**, you would replace `MemorySaver` with a persistent store (e.g., Redis, PostgreSQL) so conversations survive server restarts.

---

### Graph Visualization

```js
const drawableGraphState = await agent.getGraphAsync();
const graphStateImage = await drawableGraphState.drawMermaidPng();
writeFileSync('./graphState.png', new Uint8Array(graphStateArrayBuffer));
```

After the conversation ends, the agent's execution graph is exported as a **Mermaid diagram PNG**. This is useful for:
- Debugging the agent's decision flow.
- Documenting the architecture visually.
- Understanding how nodes and edges are connected.

---

## Project Structure

```
├── agent.js            # Main agent logic (entry point)
├── package.json        # Dependencies and scripts
├── graphState.png      # Auto-generated agent graph visualization
├── .env                # Environment variables (API keys) — not committed
└── .gitignore          # Ignores .env and node_modules
```

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **LangGraph** (`@langchain/langgraph`) | Agent framework — builds the ReAct execution graph |
| **LangChain** (`langchain`, `@langchain/core`) | Tool definitions, agent creation (`createAgent`) |
| **Groq** (`@langchain/groq`) | LLM provider — fast inference for chat models |
| **Tavily** (`@langchain/tavily`) | Web search tool for real-time information retrieval |
| **Zod** | Runtime schema validation for tool inputs |
| **dotenv** | Environment variable management |
| **Node.js** (ES Modules) | Runtime environment |

---

## Setup & Running

### Prerequisites
- Node.js v20+
- API keys for **Groq** and **Tavily**

### Installation

```bash
# Clone the repository
git clone https://github.com/AMARTYA149/ChatGPT-ReAct-Langgraph.git
cd ChatGPT-ReAct-Langgraph

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the root:

```env
GROQ_API_KEY=your_groq_api_key
TAVILY_API_KEY=your_tavily_api_key
```

### Run the Agent

```bash
npm start
# or directly:
node --env-file=.env agent.js
```

Type your queries at the `You:` prompt. Type `/bye` to exit.

---

## Code Walkthrough

### 1. Model Initialization (Lines 12–15)
```js
const model = new ChatGroq({
    model: "openai/gpt-oss-120b",
    temperature: 0
});
```
- Uses Groq as the inference provider with a specific model.
- `temperature: 0` ensures deterministic, focused responses (no randomness).

### 2. Tool Registration (Lines 17–41)
Two tools are registered:
- **TavilySearch**: Real-time web search.
- **calendarEvents**: Custom tool with Zod schema validation.

The `tool()` function wraps an async handler with metadata (name, description, schema) so the LLM knows when and how to call it.

### 3. Agent Creation (Lines 43–47)
```js
const agent = createAgent({
    model,
    tools: [search, calendarEvents],
    checkpointer: checkpointer
});
```
`createAgent()` builds a LangGraph ReAct agent that:
- Binds the tools to the LLM.
- Creates the reasoning-action-observation loop.
- Attaches the checkpointer for state persistence.

### 4. Conversation Loop (Lines 50–76)
- Uses Node.js `readline` for interactive CLI input.
- Each user message is sent with a **system prompt** that includes the current timestamp.
- The `thread_id` config enables multi-turn memory within the same thread.
- The last message in the response is always the agent's final answer.

### 5. Graph Export (Lines 78–84)
After exit, the agent's internal graph structure is rendered as a PNG via Mermaid and saved to disk.

---

## Interview Q&A

### Q1: What is the ReAct pattern and why is it used?
**A:** ReAct combines reasoning (chain-of-thought) with acting (tool use). The LLM thinks about what to do, calls a tool if needed, observes the result, and repeats until it can answer. This grounds responses in real data and reduces hallucination.

### Q2: How does LangGraph differ from LangChain's AgentExecutor?
**A:** LangGraph models agent workflows as **graphs with explicit state**, giving fine-grained control over execution flow, branching, and cycles. AgentExecutor is a simpler, linear loop. LangGraph supports:
- Custom state schemas
- Conditional routing
- Parallel tool execution
- Persistent checkpointing
- Human-in-the-loop interruptions

### Q3: What is a checkpointer and why is `MemorySaver` used?
**A:** A checkpointer saves the agent's state (messages, tool calls, intermediate results) after each graph step. `MemorySaver` stores this in-memory, enabling multi-turn conversations within a session. For production, use persistent backends (Redis, Postgres, SQLite).

### Q4: How does the LLM know which tool to call?
**A:** Each tool has a **name**, **description**, and **input schema** (defined via Zod). These are injected into the LLM's context. The LLM generates a structured tool call (JSON with function name and arguments) based on the user's query and tool descriptions. The framework parses this and executes the matching tool.

### Q5: What is the role of Zod in this project?
**A:** Zod defines runtime schemas for tool inputs. It serves two purposes:
1. **For the LLM** — the schema is converted to a JSON Schema description so the model knows what arguments to pass.
2. **For the runtime** — Zod validates the LLM's output before executing the tool, catching malformed calls.

### Q6: Why use Groq instead of calling OpenAI directly?
**A:** Groq provides extremely fast inference using custom LPU (Language Processing Unit) hardware. It offers OpenAI-compatible APIs, so switching between providers requires minimal code changes. The `@langchain/groq` package abstracts the provider details.

### Q7: What happens in the ReAct loop step-by-step?
**A:**
1. User message + system prompt → LLM
2. LLM output is checked for tool calls
3. If tool call exists → execute tool → append result to messages → go to step 1
4. If no tool call → return the LLM's text response as the final answer

### Q8: How would you extend this agent for production?
**A:**
- Replace `MemorySaver` with a persistent store (Redis/PostgreSQL)
- Add authentication and rate limiting
- Connect real APIs (Google Calendar, email, etc.) instead of mock tools
- Add error handling and retry logic for tool failures
- Implement streaming responses for better UX
- Add observability (LangSmith tracing, logging)
- Deploy as an API server (the `package.json` already has Express as a dependency)

### Q9: What is the `thread_id` config used for?
**A:** `thread_id` acts as a conversation identifier. The checkpointer uses it to scope saved state, so multiple conversations can coexist without interfering with each other. All messages within the same `thread_id` share context.

### Q10: How does the graph visualization work?
**A:** After the conversation ends, `agent.getGraphAsync()` returns the agent's internal state graph. `drawMermaidPng()` converts this to a Mermaid diagram image. The PNG is written to `graphState.png`, showing all nodes (LLM, tools) and edges (execution paths) of the agent.

---

## Key Takeaways for Interviews

1. **ReAct = Reason + Act** — The agent thinks, then uses tools, then observes results in a loop.
2. **LangGraph** models agents as stateful graphs, not linear chains.
3. **Tools** are how LLMs interact with the outside world — each tool has a name, description, and schema.
4. **Checkpointers** enable conversation memory by persisting graph state.
5. **Zod schemas** bridge the gap between unstructured LLM output and structured tool inputs.
6. **Temperature 0** = deterministic output, ideal for tool-calling agents.
7. The **system prompt** provides context (current time) and behavioral instructions.
8. The architecture is **provider-agnostic** — swapping Groq for OpenAI/Anthropic requires changing one line.
