# GenAI-JS

An AI-powered chatbot application built with Node.js that uses Groq's LLM API (Llama 3.3 70B) and Tavily web search to answer questions with real-time information.

## Features

- **AI Chat** — Conversational assistant powered by Llama 3.3 70B via Groq
- **Web Search Tool** — Automatically searches the internet (via Tavily) when real-time or unknown information is needed
- **Chat History** — Thread-based conversation memory with in-memory caching (24h TTL)
- **Two Modes**:
  - **CLI Mode** — Interactive terminal chatbot with a Hinglish-speaking "Jarvis" persona
  - **Web Mode** — Browser-based chat UI with an Express backend

## Tech Stack

- **Runtime**: Node.js (ES Modules)
- **LLM Provider**: [Groq](https://groq.com/) (OpenAI-compatible API)
- **Model**: `llama-3.3-70b-versatile`
- **Web Search**: [Tavily](https://tavily.com/)
- **Backend**: Express 5
- **Frontend**: Vanilla HTML/JS with Tailwind CSS
- **Caching**: node-cache

## Project Structure

```
├── app.js                 # CLI chatbot (Jarvis persona)
├── package.json
├── backend/
│   ├── server.js          # Express server (POST /chat)
│   └── chatbot.js         # LLM + tool-calling logic
└── frontend/
    ├── index.html          # Chat UI
    └── script.js           # Frontend logic
```

## Prerequisites

- Node.js v20+
- A [Groq API key](https://console.groq.com/)
- A [Tavily API key](https://tavily.com/)

## Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/AMARTYA149/GenAI-JS.git
   cd GenAI-JS
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create a `.env` file** in the project root:

   ```env
   GROQ_API_KEY=your_groq_api_key
   TAVILY_API_KEY=your_tavily_api_key
   ```

## Usage

### CLI Mode (Jarvis)

```bash
npm start
```

Chat directly in the terminal. Type `bye` to exit.

### Web Mode

1. Start the backend server:

   ```bash
   npm run server
   ```

2. Open `frontend/index.html` in your browser.

3. Type a message and click **Ask** or press **Enter**.

## API

### `POST /chat`

**Request body:**

```json
{
  "message": "What's the weather in Mumbai?",
  "threadId": "unique-thread-id"
}
```

**Response:**

```json
{
  "message": "The weather in Mumbai is currently..."
}
```

## License

ISC
