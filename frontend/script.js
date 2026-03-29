const input = document.querySelector('#input');
const chatContainer = document.querySelector('#chat-container');
const askBtn = document.querySelector('#ask');
const threadId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

const loadingElem = document.createElement('div');
loadingElem.className = 'my-6 animate-pulse';
loadingElem.textContent = 'Thinking...';

async function sendMessage(){
        const text = input?.value.trim();

        if(!text){
            return;
        }

        await generate(text);
}

async function handleAsk(e){
    await sendMessage();
}

async function generate(text){

        // append message to ui
        // send it to LLM
        // append response to the UI

        const msgElem = document.createElement('div');
        msgElem.className = "my-6 bg-neutral-700 p-3 rounded-xl ml-auto max-w-fit";
        msgElem.textContent = text;
        chatContainer?.appendChild(msgElem);
        input.value = "";
        askBtn.disabled = true;
        chatContainer.appendChild(loadingElem)
        loadingElem.scrollIntoView({ behavior: 'smooth' });

        //Call server
        const assistantMessage = await callServer(text);

        const assistantMsgElem = document.createElement('div');
        assistantMsgElem.className = "max-w-fit";
        assistantMsgElem.textContent = assistantMessage;
        loadingElem.remove();
        askBtn.disabled = false;
        chatContainer?.appendChild(assistantMsgElem);
        assistantMsgElem.scrollIntoView({ behavior: 'smooth' });


}

async function callServer(inputText)  {
    const response = await fetch('http://localhost:3001/chat', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({threadId, message: inputText})
    });

    if(!response.ok){
        throw new Error("Error in generating the response");
    }

    const result = await response.json();
    return result.message;
}

async function handleEvent(e){
    if(e.key === 'Enter'){
        await sendMessage();
    }
}

input?.addEventListener('keyup', handleEvent);
askBtn?.addEventListener('click', handleAsk);

