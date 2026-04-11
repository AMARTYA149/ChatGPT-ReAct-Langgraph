import { ChatGroq } from "@langchain/groq";
import "dotenv/config";

console.log("Agent working")

const model = new ChatGroq({
model: "llama-3.3-70b-versatile",
temperature: 0
});