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

// ======================
// 🔄 CARGAR PROPIEDADES
// ======================
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

// ======================
// 🔄 RECARGA AUTOMÁTICA
// ======================
fs.watchFile(path.join(__dirname, "properties.json"), () => {
  console.log("🔄 Propiedades actualizadas");
  loadProperties();
});

// ======================
// 🧠 DETECTAR PROPIEDAD
// ======================
function getPropertyFromMessage(message) {

  const text = message.toLowerCase();

  for (const property of PROPERTIES) {

    // detectar por nombre
    if (text.includes(property.name.toLowerCase())) {
      return property;
    }

    // detectar por keywords
    for (const keyword of property.keywords) {

      if (text.includes(keyword.toLowerCase())) {
        return property;
      }
    }
  }

  return null;
}

// ======================
// 🧠 PROMPT IA
// ======================
const SYSTEM_PROMPT = `
Eres Abbi 😊 asesora inmobiliaria virtual de Abbita.

Habla de forma humana, amable y profesional.

Tu objetivo es:
- ayudar
- perfilar
- generar citas
- conectar con asesor

NO inventes información.
NO presiones.
NO hables demasiado.

Todas las propiedades están en Villahermosa, Tabasco.
`;

// ======================
// ✅ VERIFICAR WEBHOOK
// ======================
app.get("/webhook", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {

    console.log("✅ WEBHOOK VERIFICADO");

    return res.status(200).send(challenge);

  } else {

    return res.sendStatus(403);
  }
});

// ======================
// 📩 WEBHOOK PRINCIPAL
// ======================
app.post("/webhook", async (req, res) => {

  try {

    const body = req.body;

fs.writeFileSync(
  "debug.json",
  JSON.stringify(body, null, 2)
);
    if (body.object === "page") {

      for (const entry of body.entry || []) {

        // ======================
        // 💬 MENSAJES
        // ======================
        if (entry.messaging) {

          for (const event of entry.messaging) {

            const senderId = event.sender?.id;

            if (!senderId) continue;

            // ======================
            // 💬 TEXTO
            // ======================
            if (event.message?.text) {

              const userMessage = event.message.text;

              console.log("📩 Mensaje:", userMessage);

              // ======================
              // 🏡 DETECTAR CASA
              // ======================
              const property = getPropertyFromMessage(userMessage);

              // ======================
              // 🏡 SI DETECTA PROPIEDAD
              // ======================
              if (property) {

                console.log("🏡 Propiedad encontrada:", property.name);

                // 📸 ENVIAR IMAGEN
                await sendImageToMeta(
                  senderId,
                  property.image
                );

                // 💬 RESPUESTA
                const propertyMessage =
`🏡 ${property.name}

💰 Precio: ${property.price}

📍 Ubicación: ${property.location}

¿Te gustaría agendar una cita o conocer más detalles? 😊`;

                await sendMessageToMeta(
                  senderId,
                  propertyMessage
                );

                continue;
              }

              // ======================
              // 🤖 RESPUESTA IA
              // ======================
              let replyText =
                "¿Qué tipo de propiedad buscas? 😊";

              try {

                const response =
                  await openai.responses.create({
                    model: "gpt-4.1-mini",
                    input: [
                      {
                        role: "system",
                        content: SYSTEM_PROMPT,
                      },
                      {
                        role: "user",
                        content: userMessage,
                      },
                    ],
                  });

                replyText = response.output_text;

              } catch (error) {

                console.log(
                  "⚠️ Error IA:",
                  error.message
                );
              }

              // ======================
              // 📲 WHATSAPP
              // ======================
              if (
                userMessage.toLowerCase().includes("cita") ||
                userMessage.toLowerCase().includes("asesor")
              ) {

                replyText +=
`\n\n👉 ${WHATSAPP_LINK}`;
              }

              // ======================
              // 📤 ENVIAR RESPUESTA
              // ======================
              await sendMessageToMeta(
                senderId,
                replyText
              );
            }
          }
        }

        // ======================
        // 💬 COMENTARIOS
        // ======================
        if (entry.changes) {

          for (const change of entry.changes) {

            if (change.field === "feed") {

              const value = change.value;

              if (
                value.item === "comment" &&
                value.comment_id
              ) {

                console.log(
                  "💬 Comentario:",
                  value.message
                );

                await replyToComment(
                  value.comment_id,
                  "¡Hola! 😊 Escríbenos por mensaje privado y con gusto te ayudamos 🏡"
                );
              }
            }
          }
        }
      }
    }

    res.sendStatus(200);

  } catch (error) {

    console.error("❌ ERROR GENERAL:", error);

    res.sendStatus(200);
  }
});

// ======================
// 📤 ENVIAR MENSAJE
// ======================
async function sendMessageToMeta(psid, text) {

  try {

    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
      {
        recipient: {
          id: psid,
        },
        message: {
          text,
        },
      }
    );

  } catch (error) {

    console.error(
      "❌ Error mensaje:",
      error.response?.data || error.message
    );
  }
}

// ======================
// 🖼️ ENVIAR IMAGEN
// ======================
async function sendImageToMeta(psid, imageUrl) {

  try {

    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
      {
        recipient: {
          id: psid,
        },
        message: {
          attachment: {
            type: "image",
            payload: {
              url: imageUrl,
              is_reusable: true,
            },
          },
        },
      }
    );

  } catch (error) {

    console.error(
      "❌ Error imagen:",
      error.response?.data || error.message
    );
  }
}

// ======================
// 💬 RESPONDER COMENTARIO
// ======================
async function replyToComment(commentId, text) {

  try {

    await axios.post(
      `https://graph.facebook.com/v18.0/${commentId}/comments`,
      {
        message: text,
        access_token:
          process.env.PAGE_ACCESS_TOKEN,
      }
    );

  } catch (error) {

    console.error(
      "❌ Error comentario:",
      error.response?.data || error.message
    );
  }
}

// ======================
// 🚀 SERVER
// ======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    `🚀 Servidor corriendo en puerto ${PORT}`
  );
});