
require("dotenv").config();

const express = require("express");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10kb" }));

// Serve the ORBIT dashboard and its files.
app.use(express.static(__dirname));

if (!process.env.GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY. Check your .env file.");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "online",
        message: "ORBIT backend is running!"
    });
});

app.post("/api/chat", async (req, res) => {
    console.log("ORBIT received a chat request");

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
                maxOutputTokens: 2048
            }
        });

        console.log("FULL AI RESPONSE:", response.text);
        console.log(
            "FINISH REASON:",
            response.candidates?.[0]?.finishReason
        );

        // Work around the two character references observed in earlier replies.
       const reply = (response.text ||
    "I couldn't generate a response. Please try again.")
    .replace(/&#x20;/gi, " ")
    .replace(/&#x48;/gi, "H")
    .replace(/&#x59;/gi, "Y");
        res.json({ reply });

    } catch (error) {
    console.error("AI request failed:", error);

    res.status(500).json({
        error: error.message ||
            "ORBIT couldn't get an AI response. Please try again."
    });
}
});

app.listen(PORT, () => {
    console.log(`ORBIT backend running at http://localhost:${PORT}`);
});
