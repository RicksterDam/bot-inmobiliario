import axios from "axios";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

let PROPERTIES = [];

// ======================
// 🔄 CARGAR PROPIEDADES
// ======================
function loadProperties() {

  try {

    const filePath =
      path.join(
        __dirname,
        "properties.json"
      );

    const data =
      fs.readFileSync(
        filePath,
        "utf-8"
      );

    PROPERTIES =
      JSON.parse(data);

    console.log(
      "✅ WhatsApp propiedades cargadas"
    );

  } catch (error) {

    console.error(
      "❌ Error cargando propiedades:",
      error
    );
  }
}

loadProperties();

// ======================
// 🧠 IA
// ======================
const SYSTEM_PROMPT = `
Eres Abbi 😊 asesora inmobiliaria virtual.

Habla natural, amable y profesional.

Objetivo:
- ayudar
- perfilar
- recomendar casas
- generar citas

Reglas:
- respuestas cortas
- no inventar información
- todas las casas están en Villahermosa Tabasco
- si el cliente pide asesor o cita intenta cerrar conversación
`;

// ======================
// 🔍 DETECTAR CASA
// ======================
function getPropertyFromMessage(
  message
) {

  const text =
    message.toLowerCase();

  for (
    const property of PROPERTIES
  ) {

    if (
      text.includes(
        property.name.toLowerCase()
      )
    ) {

      return property;
    }

    for (
      const keyword of property.keywords || []
    ) {

      if (
        text.includes(
          keyword.toLowerCase()
        )
      ) {

        return property;
      }
    }
  }

  return null;
}

// ======================
// 📲 WEBHOOK WHATSAPP
// ======================
export async function handleWhatsApp(
  body
) {

  try {

    for (
      const entry of body.entry || []
    ) {

      for (
        const change of entry.changes || []
      ) {

        const value =
          change.value;

        if (!value.messages)
          continue;

        for (
          const message of value.messages
        ) {

          const from =
            message.from;

          const text =
            message.text?.body;

          if (!text) continue;

          console.log(
            "📲 WhatsApp:",
            text
          );

          await processMessage(
            from,
            text
          );
        }
      }
    }

  } catch (error) {

    console.error(
      "❌ Error WhatsApp:",
      error.message
    );
  }
}

// ======================
// 🧠 PROCESAR MENSAJE
// ======================
async function processMessage(
  phone,
  userMessage
) {

  // ======================
  // 🏡 CASA EXACTA
  // ======================
  const property =
    getPropertyFromMessage(
      userMessage
    );

  if (property) {

    if (property.image) {

      await sendImageToWhatsApp(
        phone,
        property.image
      );
    }

    const propertyMessage =
`🏡 ${property.name}

💰 Precio:
${property.price}

📍 Ubicación:
${property.location}

😊 ¿Te gustaría agendar una cita?`;

    await sendMessageToWhatsApp(
      phone,
      propertyMessage
    );

    return;
  }

  // ======================
  // 🤖 IA
  // ======================
  let reply =
    "😊 ¿Qué tipo de propiedad buscas?";

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

    reply =
      response.output_text;

  } catch (error) {

    console.error(
      "❌ Error OpenAI:",
      error.message
    );
  }

  await sendMessageToWhatsApp(
    phone,
    reply
  );
}

// ======================
// 📤 MENSAJE
// ======================
async function sendMessageToWhatsApp(
  phone,
  text
) {

  try {

    await axios.post(
      `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product:
          "whatsapp",

        to: phone,

        type: "text",

        text: {
          body: text,
        },
      },
      {
        headers: {
          Authorization:
            `Bearer ${process.env.WHATSAPP_TOKEN}`,

          "Content-Type":
            "application/json",
        },
      }
    );

  } catch (error) {

    console.error(
      "❌ Error mensaje WhatsApp:",
      error.response?.data ||
        error.message
    );
  }
}

// ======================
// 🖼️ IMAGEN
// ======================
async function sendImageToWhatsApp(
  phone,
  imageUrl
) {

  try {

    await axios.post(
      `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product:
          "whatsapp",

        to: phone,

        type: "image",

        image: {
          link: imageUrl,
        },
      },
      {
        headers: {
          Authorization:
            `Bearer ${process.env.WHATSAPP_TOKEN}`,

          "Content-Type":
            "application/json",
        },
      }
    );

  } catch (error) {

    console.error(
      "❌ Error imagen WhatsApp:",
      error.response?.data ||
        error.message
    );
  }
}