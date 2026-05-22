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

    const filePath =
      path.join(__dirname, "properties.json");

    const data =
      fs.readFileSync(filePath, "utf-8");

    PROPERTIES = JSON.parse(data);

    console.log("✅ Propiedades cargadas");

  } catch (error) {

    console.error(
      "❌ Error cargando propiedades:",
      error
    );
  }
}

loadProperties();

// ======================
// 🔄 RECARGA AUTOMÁTICA
// ======================
fs.watchFile(
  path.join(__dirname, "properties.json"),
  () => {

    console.log("🔄 Propiedades actualizadas");

    loadProperties();
  }
);

// ======================
// 🧠 DETECTAR PROPIEDAD
// ======================
function getPropertyFromMessage(message) {

  const text =
    message.toLowerCase();

  for (const property of PROPERTIES) {

    // detectar por nombre
    if (
      text.includes(
        property.name.toLowerCase()
      )
    ) {
      return property;
    }

    // detectar keywords
    for (const keyword of property.keywords || []) {

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
// 💰 DETECTAR PRESUPUESTO
// ======================
function extractBudget(message) {

  const text =
    message
      .replace(/,/g, "")
      .toLowerCase();

  // millones
  const millionMatch =
    text.match(
      /(\d+(?:\.\d+)?)\s*(millones|millon|mdp)/i
    );

  if (millionMatch) {

    return (
      parseFloat(millionMatch[1]) *
      1000000
    );
  }

  // cantidades normales
  const numberMatch =
    text.match(/\$?(\d{5,9})/);

  if (numberMatch) {

    return parseInt(numberMatch[1]);
  }

  return null;
}

// ======================
// 🏡 BUSCAR POR PRESUPUESTO
// ======================
function getPropertiesByBudget(budget) {

  return PROPERTIES.filter(property => {

    const numericPrice =
      parseInt(
        String(property.price)
          .replace(/[^0-9]/g, "")
      );

    return numericPrice <= budget;

  }).slice(0, 3);
}

// ======================
// 🧠 PROMPT IA
// ======================
const SYSTEM_PROMPT = `
Eres Abbi 😊 asesora inmobiliaria virtual de Abbita.

Habla de forma humana, amable y profesional.

Tu objetivo es:
- ayudar
- perfilar al cliente
- generar citas
- conectar con un asesor humano

Reglas IMPORTANTES:
- NO inventes información.
- NO supongas precios, mensualidades, enganches, tasas o promociones.
- Si no tienes información suficiente o exacta, dilo claramente.
- Si el cliente pide precios, mensualidades, casas sin enganche o financiamiento y no tienes datos concretos, responde que un asesor humano le dará la información exacta.
- NO repitas las mismas preguntas.
- NO insistas demasiado.
- Responde de forma corta, clara y natural.
- Todas las propiedades están en Villahermosa, Tabasco.

IMPORTANTE SOBRE MODELOS DE CASAS:
- Si el cliente pregunta por un modelo de casa, primero pregunta si conoce el nombre exacto del modelo.
- Si el cliente NO conoce el nombre del modelo, pregunta su presupuesto aproximado para buscar opciones similares.
- Si el cliente tampoco tiene presupuesto, NO seguir preguntando lo mismo.
- En ese caso ofrece conectar con un asesor humano.

IMPORTANTE SOBRE PRESUPUESTOS:
- Si el cliente menciona un presupuesto aproximado, usa SOLO propiedades reales disponibles.
- NO inventes propiedades.
- Si no hay opciones disponibles dentro del presupuesto, dilo claramente.
- Nunca inventes mensualidades ni financiamientos.

IMPORTANTE:
- Nunca hagas más de 2 preguntas seguidas para perfilar.
- Si después de 2 preguntas no tienes suficiente información, ofrece contacto con asesor humano.

Cuando falte información exacta usa respuestas como:
- “Para darte información correcta sobre mensualidades o casas sin enganche, un asesor puede ayudarte mejor 😊”
- “No quiero darte información incorrecta. Un asesor puede explicarte opciones y costos reales.”
- “Las mensualidades y requisitos cambian según la propiedad y perfil del cliente. Te puedo conectar con un asesor.”

Si el cliente no sabe presupuesto o zona:
- NO seguir preguntando lo mismo.
- Ofrecer directamente contacto con asesor.
`;

// ======================
// ✅ VERIFICAR WEBHOOK
// ======================
app.get("/webhook", (req, res) => {

  const mode =
    req.query["hub.mode"];

  const token =
    req.query["hub.verify_token"];

  const challenge =
    req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === VERIFY_TOKEN
  ) {

    console.log(
      "✅ WEBHOOK VERIFICADO"
    );

    return res
      .status(200)
      .send(challenge);

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

            const senderId =
              event.sender?.id;

            if (!senderId) continue;

            // ======================
            // 💬 TEXTO
            // ======================
            if (event.message?.text) {

              const userMessage =
                event.message.text;

              console.log(
                "📩 Mensaje:",
                userMessage
              );

              // ======================
              // 🏡 DETECTAR CASA
              // ======================
              const property =
                getPropertyFromMessage(
                  userMessage
                );

              // ======================
              // 🏡 SI DETECTA PROPIEDAD
              // ======================
              if (property) {

                console.log(
                  "🏡 Propiedad encontrada:",
                  property.name
                );

                // 📸 ENVIAR IMAGEN
                if (property.image) {

                  await sendImageToMeta(
                    senderId,
                    property.image
                  );
                }

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
              // 💰 BUSCAR PRESUPUESTO
              // ======================
              const budget =
                extractBudget(
                  userMessage
                );

              if (budget) {

                console.log(
                  "💰 Presupuesto detectado:",
                  budget
                );

                const properties =
                  getPropertiesByBudget(
                    budget
                  );

                if (
                  properties.length > 0
                ) {

                  let response =
`😊 Encontré algunas opciones dentro de tu presupuesto:

`;

                  for (const property of properties) {

                    response +=
`🏡 ${property.name}
💰 ${property.price}
📍 ${property.location}

`;
                  }

                  response +=
"¿Te gustaría conocer más detalles o agendar una cita? 😊";

                  await sendMessageToMeta(
                    senderId,
                    response
                  );

                  // enviar imágenes
                  for (const property of properties) {

                    if (property.image) {

                      await sendImageToMeta(
                        senderId,
                        property.image
                      );
                    }
                  }

                  continue;

                } else {

                  await sendMessageToMeta(
                    senderId,
                    "Por el momento no encontré propiedades dentro de ese presupuesto 😊 Pero un asesor puede ayudarte a revisar más opciones disponibles."
                  );

                  continue;
                }
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

                replyText =
                  response.output_text;

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
                userMessage
                  .toLowerCase()
                  .includes("cita") ||

                userMessage
                  .toLowerCase()
                  .includes("asesor")
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
      }
    }

    res.sendStatus(200);

  } catch (error) {

    console.error(
      "❌ ERROR GENERAL:",
      error
    );

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
// 🚀 SERVER
// ======================
const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    `🚀 Servidor corriendo en puerto ${PORT}`
  );
});