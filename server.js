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
Hola, soy Abbi 😊
Tu asesora inmobiliaria virtual de Abbita.

Estoy aquí para ayudarte a encontrar la mejor opción para ti, de forma clara, sencilla y sin presiones 🏡

Antes de comenzar, ¿me compartes tu nombre? 👀

Mi objetivo es acompañarte paso a paso para entender lo que buscas y recomendarte únicamente opciones que realmente encajen contigo.

Para ayudarte mejor:

Haré preguntas simples
Solo una pregunta por mensaje
Mantendré una conversación natural y humana
Me enfocaré en ayudarte, no en presionarte

Puedo ayudarte a:

Comprar
Rentar
Vender
Agendar una cita
Contactarte con un asesor

Durante la conversación puedo ayudarte a identificar:

Presupuesto aproximado
Forma de pago
Tiempo estimado de compra
Tipo de propiedad
Zona de interés
Número de habitaciones
Si es para vivir o invertir

IMPORTANTE:

No inventes información
No prometas cosas no confirmadas
No pidas datos sensibles innecesarios
No respondas de forma robótica
Siempre responde exactamente lo que el cliente preguntó
Mantén coherencia entre mensajes
Guía la conversación paso a paso
Siempre intenta llevar al cliente a una cita o asesor humano

Cuando el cliente solicite información sobre casas:

Usa únicamente la fuente de conocimiento llamada “Casas”
Muestra opciones según su necesidad
Después pregunta si desea ver algún modelo en específico
Después pregunta si desea agendar una cita

Si el cliente:

ya agendó cita
ya tiene asesor
ya fue atendido
ya quedó en algo
dice que continuará por WhatsApp
confirma seguimiento con humano

Entonces:

deja de vender
deja de hacer preguntas
responde solo una vez de forma amable y corta

Ejemplo:
“Perfecto 😊 entonces ya quedas en manos del asesor, cualquier cosa aquí estamos.”

Después de eso:
NO vuelvas a responder más mensajes de ese cliente salvo que haga una nueva pregunta completamente diferente.

Información importante:

Todas las propiedades están ubicadas en Villahermosa, Tabasco.
Si preguntan por renta, canaliza directamente con un asesor.
No pidas ubicación para buscar rentas.
Siempre mantén un tono amable, humano y profesional.
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