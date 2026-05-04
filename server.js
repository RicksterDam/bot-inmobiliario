import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json());

// 🔐 TOKEN META
const VERIFY_TOKEN = "mi_token_seguro";

// 🔑 OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 📲 WhatsApp
const WHATSAPP_LINK = "https://wa.me/529932351715";

// 📂 RUTA SEGURA PARA JSON (IMPORTANTE PARA RENDER)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let PROPERTIES = [];

// 🔄 CARGAR PROPIEDADES
function loadProperties() {
  try {
    const filePath = path.join(__dirname, "properties.json");
    const data = fs.readFileSync(filePath, "utf-8");
    PROPERTIES = JSON.parse(data);
    console.log("✅ Propiedades cargadas");
  } catch (error) {
    console.error("❌ Error cargando propiedades:", error);
  }
}

loadProperties();

// 🔄 AUTO-RECARGA (ADMIN FRIENDLY 🔥)
fs.watchFile(path.join(__dirname, "properties.json"), () => {
  console.log("🔄 Propiedades actualizadas");
  loadProperties();
});

// 🧠 DETECTAR IMAGEN
function getImageFromMessage(message) {
  const text = message.toLowerCase();

  for (const property of PROPERTIES) {
    if (text.includes(property.name)) {
      return property.image;
    }

    for (const keyword of property.keywords) {
      if (text.includes(keyword)) {
        return property.image;
      }
    }
  }

  return null;
}

// 🧠 PROMPT
const SYSTEM_PROMPT = `
Tu nombre es Abbi 😊 Eres una asesora inmobiliaria amigable.

OBJETIVO:
Conversar natural y llevar al cliente a WhatsApp.

REGLAS:
- No des precios
- No inventes info

CUANDO ENVIAR IMAGEN:
Si mencionan modelos o casas → send_image true

RESPONDE EN JSON:
{
 "reply": "mensaje",
 "qualified": true/false,
 "send_image": true/false
}
`;

// ✅ VERIFICACIÓN META
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("VERIFY:", mode, token, challenge);

  if (mode === "subscribe" && token === "mi_token_seguro") {
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// 📩 MENSAJES
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (body.object === "page") {
      for (const entry of body.entry || []) {
        for (const event of entry.messaging || []) {

          const senderId = event.sender?.id;
          if (!senderId) continue;

          if (event.message?.text) {
            const userMessage = event.message.text;

            console.log("📩:", userMessage);

            const response = await openai.responses.create({
              model: "gpt-4.1-mini",
              input: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userMessage },
              ],
            });

            let ai;
            try {
              ai = JSON.parse(response.output_text);
            } catch {
              ai = {
                reply: "¿Qué tipo de propiedad buscas? 😊",
                qualified: false,
                send_image: false
              };
            }

            // 📸 IMAGEN
            if (ai.send_image && PROPERTIES.length > 0) {
              const specificImage = getImageFromMessage(userMessage);

              if (specificImage) {
                await sendImageToMeta(senderId, specificImage);
              } else {
                await sendImageToMeta(senderId, PROPERTIES[0].image);
              }
            }

            // 📲 WHATSAPP
            if (ai.qualified) {
              ai.reply += `\n\n👉 ${WHATSAPP_LINK}`;
            }

            await sendMessageToMeta(senderId, ai.reply);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ ERROR:", error);
    res.sendStatus(200);
  }
});

// 📤 TEXTO
async function sendMessageToMeta(psid, text) {
  await axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
    {
      recipient: { id: psid },
      message: { text },
    }
  );
}

// 🖼️ IMAGEN
async function sendImageToMeta(psid, imageUrl) {
  await axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
    {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "image",
          payload: { url: imageUrl }
        }
      }
    }
  );
}

// 🔥 PUERTO DINÁMICO (CLAVE PARA RENDER)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en ${PORT}`);
});