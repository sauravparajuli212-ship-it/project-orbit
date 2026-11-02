
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");

const STORAGE_KEY = "orbit_conversation_v1";

let conversation = loadConversation();

// Remove technical citation markers that should not appear to users.
function cleanCitationMarkers(text) {
    return String(text || "")
        .replace(/cite[^]*/g, "")
        .replace(/【?\d+†L\d+(?:-L?\d+)?】?/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

// Decode HTML character references.
function decodeCharacterReferences(text) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text || "";
    return textarea.value;
}

// Render safe Markdown.
function renderMarkdown(element, text) {
    const cleanedText = cleanCitationMarkers(text);
    const decodedText = decodeCharacterReferences(cleanedText);

    const rawHtml = marked.parse(decodedText);

    element.innerHTML = DOMPurify.sanitize(rawHtml);

    // Make links safe and open them in a new tab.
    element.querySelectorAll("a").forEach(link => {
        try {
            const url = new URL(link.href);

            if (url.protocol !== "https:" && url.protocol !== "http:") {
                link.removeAttribute("href");
                return;
            }

            link.target = "_blank";
            link.rel = "noopener noreferrer";
        } catch {
            link.removeAttribute("href");
        }
    });
}

// Validate source URLs.
function isValidSourceUrl(value) {
    try {
        const url = new URL(value);

        return (
            url.protocol === "https:" ||
            url.protocol === "http:"
        );
    } catch {
        return false;
    }
}

// Display clickable sources below an assistant response.
function addSources(message, sources) {
    if (!Array.isArray(sources) || sources.length === 0) {
        return;
    }

    const validSources = sources.filter(source =>
        source &&
        typeof source.title === "string" &&
        typeof source.url === "string" &&
        isValidSourceUrl(source.url)
    );

    if (validSources.length === 0) {
        return;
    }

    const sourceContainer = document.createElement("div");
    sourceContainer.className = "orbit-sources";

    const heading = document.createElement("strong");
    heading.textContent = "Sources";

    sourceContainer.appendChild(heading);

    const list = document.createElement("ul");

    validSources.forEach(source => {
        const item = document.createElement("li");
        const link = document.createElement("a");

        link.href = source.url;
        link.textContent = source.title;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        item.appendChild(link);

        if (typeof source.publishedAt === "string") {
            const date = document.createElement("small");
            date.textContent = ` (${source.publishedAt})`;
            item.appendChild(date);
        }

        list.appendChild(item);
    });

    sourceContainer.appendChild(list);
    message.appendChild(sourceContainer);
}

// Load conversation from browser storage.
function loadConversation() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (!saved) return [];

        const parsed = JSON.parse(saved);

        if (!Array.isArray(parsed)) return [];

        return parsed.filter(item =>
            item &&
            ["user", "assistant"].includes(item.role) &&
            typeof item.text === "string"
        ).map(item => ({
            role: item.role,
            text: item.text,
            sources: Array.isArray(item.sources) ? item.sources : []
        }));

    } catch (error) {
        console.error("Could not load ORBIT history:", error);
        return [];
    }
}

// Save conversation.
function saveConversation() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(conversation)
        );
    } catch (error) {
        console.error("Could not save ORBIT history:", error);
    }
}

// Display a message.
function addMessage(sender, text, className, sources = []) {
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

    if (className === "assistant-message") {
        addSources(message, sources);
    }

    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return message;
}

// Restore saved messages.
function restoreConversation() {
    chatMessages.innerHTML = "";

    conversation.forEach(item => {
        if (item.role === "user") {
            addMessage("You", item.text, "user-message");
        } else {
            addMessage(
                "ORBIT",
                item.text,
                "assistant-message",
                item.sources
            );
        }
    });
}

// Create New Chat button.
function createNewChatButton() {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = "＋ New Chat";
    button.className = "orbit-new-chat";

    button.style.marginBottom = "12px";
    button.style.padding = "8px 14px";
    button.style.borderRadius = "8px";
    button.style.cursor = "pointer";

    button.addEventListener("click", () => {
        conversation = [];

        saveConversation();

        chatMessages.innerHTML = "";
        chatInput.value = "";
        chatInput.focus();
    });

    chatForm.parentElement.insertBefore(button, chatForm);

    return button;
}

// Initialize chat.
restoreConversation();
createNewChatButton();

// Send a message.
chatForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const text = chatInput.value.trim();

    if (!text) {
        chatInput.focus();
        return;
    }

    const sendButton = chatForm.querySelector(
        'button[type="submit"]'
    );

    if (sendButton) {
        sendButton.disabled = true;
    }

    // Display and save the user's message.
    addMessage("You", text, "user-message");

    conversation.push({
        role: "user",
        text: text
    });

    saveConversation();

    chatInput.value = "";

    const thinkingMessage = addMessage(
        "ORBIT",
        "Thinking...",
        "assistant-message"
    );

    try {
        // Send previous conversation history.
        // The current message is sent separately.
        const history = conversation
            .slice(0, -1)
            .map(item => ({
                role: item.role === "assistant" ? "assistant" : "user",
                text: item.text
            }));

        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: text,
                history: history
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "The AI request failed."
            );
        }

        const reply =
            data.reply || "ORBIT returned an empty response.";

        const sources = Array.isArray(data.sources)
            ? data.sources
            : [];

        // Display the AI response.
        const content = thinkingMessage.querySelector(
            ".message-content"
        );

        renderMarkdown(content, reply);

        // Display clickable sources.
        addSources(thinkingMessage, sources);

        // Save the assistant response and sources.
        conversation.push({
            role: "assistant",
            text: reply,
            sources: sources
        });

        saveConversation();

    } catch (error) {
        const content = thinkingMessage.querySelector(
            ".message-content"
        );

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
