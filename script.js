
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");

// Convert Markdown into HTML, then sanitize it before displaying.
function renderMarkdown(element, text) {
    const rawHtml = marked.parse(text || "");
    element.innerHTML = DOMPurify.sanitize(rawHtml);
}

function addMessage(sender, text, className) {
    const message = document.createElement("div");
    message.className = `message ${className}`;

    const name = document.createElement("strong");
    name.textContent = sender;

    const content = document.createElement("div");
    content.className = "message-content";

    if (className === "assistant-message") {
        renderMarkdown(content, text);
    } else {
        content.textContent = text;
    }

    message.append(name, content);
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return message;
}

chatForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const text = chatInput.value.trim();

    if (!text) {
        chatInput.focus();
        return;
    }

    addMessage("You", text, "user-message");
    chatInput.value = "";

    const thinkingMessage = addMessage(
        "ORBIT",
        "Thinking...",
        "assistant-message"
    );

    const sendButton = chatForm.querySelector('button[type="submit"]');

    if (sendButton) {
        sendButton.disabled = true;
    }

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message: text })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "The AI request failed.");
        }

        renderMarkdown(
            thinkingMessage.querySelector(".message-content"),
            data.reply || "ORBIT returned an empty response."
        );

    } catch (error) {
        const content = thinkingMessage.querySelector(".message-content");
        content.textContent =
            error.message || "Something went wrong. Please try again.";

        console.error("ORBIT chat error:", error);

    } finally {
        if (sendButton) {
            sendButton.disabled = false;
        }

        chatInput.focus();
    }
});
