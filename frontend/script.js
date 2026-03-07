const input = document.querySelector('#input');
const chatContainer = document.querySelector('#chat-container');
const askBtn = document.querySelector('#ask');

function sendMessage(){
        const text = input?.value.trim();

        if(!text){
            return;
        }

        generate(text);
}

function handleAsk(e){
    sendMessage();
}

function generate(text){
        const msg = document.createElement('div');
        msg.className = "my-6 bg-neutral-700 p-3 rounded-xl ml-auto max-w-fit";
        msg.textContent = text;
        chatContainer?.appendChild(msg);
        input.value = "";
}

function handleEvent(e){
    if(e.key === 'Enter'){
        sendMessage();
    }
}

input?.addEventListener('keyup', handleEvent);
askBtn?.addEventListener('click', handleAsk);

