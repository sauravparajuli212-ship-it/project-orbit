
require("dotenv").config();

const express = require("express");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10kb" }));
app.use(express.static(__dirname));

// Make sure the API key exists.
if (!process.env.GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY. Check your .env file.");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// Basic in-memory request limit.
// This is not a strict daily quota and resets when the server restarts.
const requestCounts = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 10;

app.use("/api/chat", (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    let entry = requestCounts.get(ip);

    if (!entry || now - entry.start >= WINDOW_MS) {
        entry = {
            start: now,
            count: 0
        };
    }

    if (entry.count >= MAX_REQUESTS_PER_IP) {
        return res.status(429).json({
            error:
                "You've reached the chat limit for this hour. Please try again later."
        });
    }

    entry.count++;
    requestCounts.set(ip, entry);

    next();
});

// Clean up expired request-limit entries.
setInterval(() => {
    const now = Date.now();

    for (const [ip, entry] of requestCounts.entries()) {
        if (now - entry.start >= WINDOW_MS) {
            requestCounts.delete(ip);
        }
    }
}, WINDOW_MS).unref();

// Health check.
app.get("/api/health", (req, res) => {
    res.json({
        status: "online",
        message: "ORBIT backend is running!"
    });
});

// AI chat endpoint.
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
            model: "gemini-3.1-flash-lite",
            contents: message.trim(),
           config: {
    systemInstruction:
        "You are ORBIT, a helpful AI assistant. Explain clearly for beginners. Complete your sentences and requested bullet points. Keep answers concise. For current events, recent sports results, changing facts, or questions that need up-to-date information, use Google Search when available. Prefer verified recent sources, state dates clearly, and never invent facts or sources. If information cannot be verified, say so.",
    tools: [{ googleSearch: {} }],
    maxOutputTokens: 1024
}
            }
        });

        let reply = response.text ||
            "I couldn't generate a response. Please try again.";

        // Decode hexadecimal HTML character references, such as &#x54;.
        reply = reply.replace(
            /&#x([0-9a-f]+);/gi,
            (match, code) => {
                const value = parseInt(code, 16);

                if (
                    !Number.isFinite(value) ||
                    value < 0 ||
                    value > 0x10FFFF ||
                    (value >= 0xD800 && value <= 0xDFFF)
                ) {
                    return match;
                }

                return String.fromCodePoint(value);
            }
        );

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
                error:
                    "ORBIT has reached its current AI usage limit. Please try again after the quota resets."
            });
        }

        return res.status(500).json({
            error:
                "ORBIT couldn't get an AI response. Please try again shortly."
        });
    }
});

// Handle invalid JSON requests.
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400) {
        return res.status(400).json({
            error: "Invalid request format. Please try again."
        });
    }

    return next(error);
});

app.listen(PORT, () => {
    console.log(`ORBIT backend running on port ${PORT}`);
});
