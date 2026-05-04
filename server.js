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

const VERIFY_TOKEN = "mi_token_seguro";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const WHATSAPP_LINK = "https://wa.me/529932351715";

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

// 🔄 AUTO RECARGA
fs.watchFile(path.join(__dirname, "properties.json"), () => {
  console.log("🔄 Propiedades actualizadas");
  loadProperties();
});

// 🧠 DETECTAR IMAGEN
function getImageFromMessage(message) {
  const text = message.toLowerCase();

  for (const property of PROPERTIES) {
    if (text.includes(property.name)) return property.image;

    for (const keyword of property.keywords) {
      if (text.includes(keyword)) return property.image;
    }
  }

  return null;
}

// 🧠 PROMPT IA (simplificado)
const SYSTEM_PROMPT = `
Eres Abbi 😊 asesora inmobiliaria.

Responde natural y breve.
No des precios.
Lleva al usuario a WhatsApp.
`;

// ✅ VERIFICACIÓN
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// 📩 WEBHOOK PRINCIPAL
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    console.log("📩 BODY:", JSON.stringify(body, null, 2));

    if (body.object === "page") {
      for (const entry of body.entry || []) {

        // =====================
        // 💬 MENSAJES (DM)
        // =====================
        if (entry.messaging) {
          for (const event of entry.messaging) {

            const senderId = event.sender?.id;
            if (!senderId) continue;

            if (event.message?.text) {
              const userMessage = event.message.text;

              console.log("📩 Mensaje:", userMessage);

              // 🔥 DETECTAR IMAGEN (ANTES DE IA)
              const specificImage = getImageFromMessage(userMessage);

              let replyText = "¿Qué tipo de propiedad buscas? 😊";

              // 🤖 IA SOLO PARA TEXTO
              try {
                const response = await openai.responses.create({
                  model: "gpt-4.1-mini",
                  input: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userMessage },
                  ],
                });

                replyText = response.output_text;
              } catch (err) {
                console.log("⚠️ Error IA, usando fallback");
              }

              // 📸 IMAGEN (SI DETECTA MODELO)
              if (specificImage && PROPERTIES.length > 0) {
                await sendImageToMeta(senderId, specificImage);
                replyText = "Claro 😊 aquí tienes ese modelo 👇";
              }

              // 📲 WHATSAPP
              if (userMessage.toLowerCase().includes("cita") ||
                  userMessage.toLowerCase().includes("información")) {
                replyText += `\n\n👉 ${WHATSAPP_LINK}`;
              }

              await sendMessageToMeta(senderId, replyText);
            }
          }
        }

        // =====================
        // 💬 COMENTARIOS
        // =====================
        if (entry.changes) {
          for (const change of entry.changes) {

            if (change.field === "feed") {
              const value = change.value;

              if (value.item === "comment" && value.comment_id) {

                console.log("💬 Comentario:", value.message);

                const commentId = value.comment_id;

                await replyToComment(
                  commentId,
                  "¡Hola! 😊 Escríbenos por mensaje privado y te damos toda la información 📩"
                );
              }
            }
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

// 📤 RESPONDER MENSAJE
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

// 💬 RESPONDER COMENTARIO
async function replyToComment(commentId, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${commentId}/comments`,
      {
        message: text,
        access_token: process.env.PAGE_ACCESS_TOKEN,
      }
    );
  } catch (error) {
    console.error("❌ Error comentario:", error.response?.data || error.message);
  }
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en ${PORT}`);
});