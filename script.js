
const NAME_KEY = "orbit_display_name";
const CHATS_KEY = "orbit_chats_v1";

const welcomeScreen = document.getElementById("welcome-screen");
const nameForm = document.getElementById("name-form");
const nameInput = document.getElementById("name-input");

const app = document.getElementById("app");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendButton = document.getElementById("send-button");
const chatMessages = document.getElementById("chat-messages");
const chatList = document.getElementById("chat-list");
const emptyState = document.getElementById("empty-state");

const newChatButton = document.getElementById("new-chat-btn");
const topNewChatButton = document.getElementById("top-new-chat");
const changeNameButton = document.getElementById("change-name-btn");
const mobileMenuButton = document.getElementById("mobile-menu-btn");
const sidebar = document.getElementById("sidebar");

const MAX_CHATS = 50;
const MAX_HISTORY = 20;

let userName = "";
let chats = loadChats();
let currentChatId = null;
let isSending = false;

// Create a unique chat ID.
function createId() {
    return Date.now().toString(36) +
        Math.random().toString(36).slice(2, 9);
}

// Load saved chats.
function loadChats() {
    try {
        const saved = localStorage.getItem(CHATS_KEY);

        if (!saved) return [];

        const parsed = JSON.parse(saved);

        if (!Array.isArray(parsed)) return [];

        return parsed
            .filter(chat =>
                chat &&
                typeof chat.id === "string" &&
                Array.isArray(chat.messages)
            )
            .slice(0, MAX_CHATS)
            .map(chat => ({
                id: chat.id,
                title: typeof chat.title === "string"
                    ? chat.title.slice(0, 80)
                    : "New chat",
                updatedAt: Number(chat.updatedAt) || Date.now(),
                messages: chat.messages
                    .filter(message =>
                        message &&
                        ["user", "assistant"].includes(message.role) &&
                        typeof message.text === "string"
                    )
                    .slice(-100)
                    .map(message => ({
                        role: message.role,
                        text: message.text.slice(0, 10000),
                        sources: Array.isArray(message.sources)
                            ? message.sources.slice(0, 10)
                            : []
                    }))
            }))
            .sort((a, b) => b.updatedAt - a.updatedAt);

    } catch (error) {
        console.error("Could not load chats:", error);
        return [];
    }
}

// Save chats.
function saveChats() {
    try {
        chats.sort((a, b) => b.updatedAt - a.updatedAt);
        chats = chats.slice(0, MAX_CHATS);

        localStorage.setItem(
            CHATS_KEY,
            JSON.stringify(chats)
        );
    } catch (error) {
        console.error("Could not save chats:", error);
    }
}

// Find the active chat.
function getCurrentChat() {
    return chats.find(chat => chat.id === currentChatId);
}

// Start a new chat.
function createNewChat() {
    if (isSending) return;

    const chat = {
        id: createId(),
        title: "New chat",
        updatedAt: Date.now(),
        messages: []
    };

    chats.unshift(chat);
    currentChatId = chat.id;

    saveChats();
    renderChatList();
    renderCurrentChat();

    chatInput.value = "";
    chatInput.focus();

    sidebar.classList.remove("open");
}

// Update chat title using its first user message.
function updateChatTitle(chat) {
    const firstMessage = chat.messages.find(
        message => message.role === "user"
    );

    if (firstMessage && chat.title === "New chat") {
        chat.title = firstMessage.text
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 45);

        if (firstMessage.text.length > 45) {
            chat.title += "...";
        }
    }
}

// Render recent chats.
function renderChatList() {
    chatList.innerHTML = "";

    const sortedChats = [...chats].sort(
        (a, b) => b.updatedAt - a.updatedAt
    );

    if (sortedChats.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No conversations yet.";
        empty.style.color = "#777b91";
        empty.style.fontSize = "12px";
        empty.style.padding = "0 10px";

        chatList.appendChild(empty);
        return;
    }

    sortedChats.forEach(chat => {
        const row = document.createElement("div");
        row.className = "chat-list-item";

        if (chat.id === currentChatId) {
            row.classList.add("active");
        }

        const title = document.createElement("span");
        title.className = "chat-title";
        title.textContent = chat.title;

        title.addEventListener("click", () => {
            if (isSending) return;

            currentChatId = chat.id;
            renderChatList();
            renderCurrentChat();
            sidebar.classList.remove("open");
        });

        const menu = document.createElement("button");
        menu.className = "chat-menu";
        menu.type = "button";
        menu.textContent = "⋯";
        menu.title = "Chat options";
        menu.setAttribute("aria-label", "Chat options");

        menu.addEventListener("click", event => {
            event.stopPropagation();

            if (isSending) return;

            const action = prompt(
                "Type R to rename this chat or D to delete it."
            );

            if (!action) return;

            if (action.toLowerCase() === "r") {
                const newTitle = prompt(
                    "Enter a new chat name:",
                    chat.title
                );

                if (newTitle && newTitle.trim()) {
                    chat.title = newTitle.trim().slice(0, 80);
                    chat.updatedAt = Date.now();

                    saveChats();
                    renderChatList();
                }
            }

            if (action.toLowerCase() === "d") {
                const confirmed = confirm(
                    "Delete this conversation permanently from this browser?"
                );

                if (!confirmed) return;

                chats = chats.filter(item => item.id !== chat.id);

                if (currentChatId === chat.id) {
                    currentChatId = null;
                }

                saveChats();

                if (!currentChatId) {
                    if (chats.length > 0) {
                        currentChatId = chats[0].id;
                    } else {
                        createNewChat();
                        return;
                    }
                }

                renderChatList();
                renderCurrentChat();
            }
        });

        row.append(title, menu);
        chatList.appendChild(row);
    });
}

// Remove technical citation markers.
function cleanCitationMarkers(text) {
    return String(text || "")
        .replace(/cite[^]*/g, "")
        .replace(/【?\d+†L\d+(?:-L?\d+)?】?/g, "")
        .trim();
}

// Safely render Markdown.
function renderMarkdown(element, text) {
    const cleaned = cleanCitationMarkers(text);

    if (
        typeof marked === "undefined" ||
        typeof DOMPurify === "undefined"
    ) {
        element.textContent = cleaned;
        return;
    }

    const html = marked.parse(cleaned);

    element.innerHTML = DOMPurify.sanitize(html);

    element.querySelectorAll("a").forEach(link => {
        try {
            const url = new URL(link.href);

            if (
                url.protocol !== "https:" &&
                url.protocol !== "http:"
            ) {
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

        return url.protocol === "https:" ||
            url.protocol === "http:";
    } catch {
        return false;
    }
}

// Display source links when the backend supplies verified sources.
function addSources(message, sources) {
    if (!Array.isArray(sources)) return;

    const validSources = sources.filter(source =>
        source &&
        typeof source.title === "string" &&
        typeof source.url === "string" &&
        isValidSourceUrl(source.url)
    );

    if (validSources.length === 0) return;

    const container = document.createElement("div");
    container.className = "orbit-sources";

    const heading = document.createElement("strong");
    heading.textContent = "Sources";

    const list = document.createElement("ul");

    validSources.forEach(source => {
        const item = document.createElement("li");
        const link = document.createElement("a");

        link.href = source.url;
        link.textContent = source.title;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        item.appendChild(link);
        list.appendChild(item);
    });

    container.append(heading, list);
    message.appendChild(container);
}

// Display one message.
function addMessage(role, text, sources = []) {
    const message = document.createElement("article");

    message.className = role === "user"
        ? "message user-message"
        : "message assistant-message";

    const header = document.createElement("div");
    header.className = "message-header";

    const avatar = document.createElement("span");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user"
        ? userName.charAt(0).toUpperCase()
        : "O";

    const label = document.createElement("span");
    label.textContent = role === "user" ? userName : "ORBIT";

    header.append(avatar, label);

    const content = document.createElement("div");
    content.className = "message-content";

    if (role === "assistant") {
        renderMarkdown(content, text);
    } else {
        content.textContent = text;
    }

    message.append(header, content);

    if (role === "assistant") {
        addSources(message, sources);
    }

    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return message;
}

// Show or hide welcome screen inside chat.
function updateEmptyState(chat) {
    const hasMessages = chat && chat.messages.length > 0;

    emptyState.classList.toggle("hidden", hasMessages);
    chatMessages.classList.toggle("hidden", !hasMessages);

    if (!hasMessages) {
        document.getElementById("welcome-name").textContent =
            userName || "there";
    }
}

// Render the current conversation.
function renderCurrentChat() {
    const chat = getCurrentChat();

    chatMessages.innerHTML = "";

    if (!chat) {
        updateEmptyState(null);
        return;
    }

    updateEmptyState(chat);

    chat.messages.forEach(message => {
        addMessage(
            message.role,
            message.text,
            message.sources
        );
    });
}

// Show the application.
function showApp() {
    welcomeScreen.classList.add("hidden");
    app.classList.remove("hidden");

    document.getElementById("sidebar-name").textContent = userName;
    document.getElementById("sidebar-avatar").textContent =
        userName.charAt(0).toUpperCase();

    document.getElementById("welcome-name").textContent = userName;

    if (!currentChatId || !getCurrentChat()) {
        if (chats.length > 0) {
            currentChatId = chats[0].id;
        } else {
            const chat = {
                id: createId(),
                title: "New chat",
                updatedAt: Date.now(),
                messages: []
            };

            chats.unshift(chat);
            currentChatId = chat.id;
            saveChats();
        }
    }

    renderChatList();
    renderCurrentChat();
}

// First-time name setup.
nameForm.addEventListener("submit", event => {
    event.preventDefault();

    const name = nameInput.value.trim();

    if (!name) return;

    userName = name.slice(0, 30);

    localStorage.setItem(NAME_KEY, userName);

    showApp();
});

// Change saved display name.
changeNameButton.addEventListener("click", () => {
    const newName = prompt("What should ORBIT call you?", userName);

    if (!newName || !newName.trim()) return;

    userName = newName.trim().slice(0, 30);

    localStorage.setItem(NAME_KEY, userName);

    document.getElementById("sidebar-name").textContent = userName;
    document.getElementById("sidebar-avatar").textContent =
        userName.charAt(0).toUpperCase();

    document.getElementById("welcome-name").textContent = userName;

    renderCurrentChat();
});

// New chat buttons.
newChatButton.addEventListener("click", createNewChat);
topNewChatButton.addEventListener("click", createNewChat);

// Mobile sidebar.
mobileMenuButton.addEventListener("click", () => {
    sidebar.classList.toggle("open");
});

// Suggestion buttons.
document.querySelectorAll(".suggestion").forEach(button => {
    button.addEventListener("click", () => {
        chatInput.value = button.dataset.prompt || "";
        chatInput.focus();
        chatInput.dispatchEvent(new Event("input"));
    });
});

// Auto-resize message input.
chatInput.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height =
        Math.min(chatInput.scrollHeight, 180) + "px";
});

// Send message.
chatForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (isSending) return;

    const text = chatInput.value.trim();

    if (!text) return;

    const chat = getCurrentChat();

    if (!chat) return;

    isSending = true;

    sendButton.disabled = true;
    chatInput.disabled = true;

    // Add user message.
    chat.messages.push({
        role: "user",
        text
    });

    chat.updatedAt = Date.now();

    updateChatTitle(chat);
    saveChats();

    chatInput.value = "";
    chatInput.style.height = "auto";

    renderChatList();
    renderCurrentChat();

    // Show temporary thinking message.
    const thinkingMessage = addMessage(
        "assistant",
        "Thinking..."
    );

    try {
        const history = chat.messages
            .slice(0, -1)
            .slice(-MAX_HISTORY)
            .map(message => ({
                role: message.role,
                text: message.text
            }));
const response = await fetch("https://project-orbit-1.onrender.com/api/chat", {
    method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: text,
                history
            })
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error("ORBIT returned an invalid response.");
        }

        if (!response.ok) {
            throw new Error(
                data.error || "ORBIT could not process your request."
            );
        }

        const reply =
            typeof data.reply === "string" && data.reply.trim()
                ? data.reply
                : "ORBIT returned an empty response.";

        const sources = Array.isArray(data.sources)
            ? data.sources
            : [];

        // Replace temporary thinking message.
        thinkingMessage.remove();

        addMessage("assistant", reply, sources);

        chat.messages.push({
            role: "assistant",
            text: reply,
            sources
        });

        chat.updatedAt = Date.now();

        saveChats();
        renderChatList();

    } catch (error) {
        const content = thinkingMessage.querySelector(
            ".message-content"
        );

        content.textContent =
            error.message || "Something went wrong. Please try again.";

        console.error("ORBIT error:", error);

    } finally {
        isSending = false;

        sendButton.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
    }
});

// Start the application.
const savedName = localStorage.getItem(NAME_KEY);

if (savedName && savedName.trim()) {
    userName = savedName.trim().slice(0, 30);
    showApp();
} else {
    welcomeScreen.classList.remove("hidden");
    app.classList.add("hidden");
    nameInput.focus();
}
