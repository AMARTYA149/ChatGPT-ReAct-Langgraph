import { writeFileSync } from "node:fs";

export async function printGraph(agent, graphPath) {
    const drawableGraphState = await agent.getGraphAsync();
    const graphStateImage = await drawableGraphState.drawMermaidPng();
    const graphStateArrayBuffer = await graphStateImage.arrayBuffer();

    writeFileSync(graphPath, new Uint8Array(graphStateArrayBuffer));
}