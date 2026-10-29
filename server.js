
require("dotenv").config();

const express = require("express");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10kb" }));
app.use(express.static(__dirname));

if (!process.env.GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY. Check your .env file.");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// Basic in-memory request limit.
// This is a safeguard, not a strict daily quota.
const requestCounts = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 10;

app.use("/api/chat", (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    let entry = requestCounts.get(ip);

    if (!entry || now - entry.start >= WINDOW_MS) {
        entry = { start: now, count: 0 };
    }

    if (entry.count >= MAX_REQUESTS_PER_IP) {
        return res.status(429).json({
            error: "You've reached the chat limit for this hour. Please try again later."
        });
    }

    entry.count++;
    requestCounts.set(ip, entry);
    next();
});

// Periodically remove expired entries from memory.
setInterval(() => {
    const now = Date.now();

    for (const [ip, entry] of requestCounts) {
        if (now - entry.start >= WINDOW_MS) {
            requestCounts.delete(ip);
        }
    }
}, WINDOW_MS).unref();

app.get("/api/health", (req, res) => {
    res.json({
        status: "online",
        message: "ORBIT backend is running!"
    });
});

app.post("/api/chat", async (req, res) => {
    try {
        const message = req.body?.message;

        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                error: "Please enter a message."
            });
        }

        if (message.length > 2000) {
            return res.status(400).json({
                error: "Please keep messages under 2000 characters."
            });
        }

        const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: message.trim(),
            config: {
                systemInstruction:
                    "You are ORBIT, a helpful AI assistant. Explain clearly for beginners. Complete your sentences and requested bullet points. Keep answers concise.",
                maxOutputTokens: 1024
            }
        });

        const reply = (response.text ||
            "I couldn't generate a response. Please try again.")
            .replace(/&#x20;/gi, " ")
            .replace(/&#x48;/gi, "H")
            .replace(/&#x59;/gi, "Y");

        return res.json({ reply });

    } catch (error) {
        console.error("AI request failed:", error.message);

        const message = String(error.message || "");
        const isQuotaError =
            error.status === 429 ||
            error.code === 429 ||
            message.includes("429") ||
            message.toLowerCase().includes("quota") ||
            message.includes("RESOURCE_EXHAUSTED");

        if (isQuotaError) {
            return res.status(429).json({
                error: "ORBIT has reached its current AI usage limit. Please try again after the quota resets."
            });
        }

        return res.status(500).json({
            error: "ORBIT couldn't get an AI response. Please try again shortly."
        });
    }
});

app.listen(PORT, () => {
    console.log(`ORBIT backend running on port ${PORT}`);
});
