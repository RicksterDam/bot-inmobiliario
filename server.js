import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import { handleWhatsApp } from "./whatsapp.js";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "mi_token_seguro";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const WHATSAPP_LINK =
  "https://wa.me/529932351715";

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
      "✅ Propiedades cargadas"
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
// 🔄 RECARGA AUTOMÁTICA
// ======================
fs.watchFile(
  path.join(
    __dirname,
    "properties.json"
  ),
  () => {

    console.log(
      "🔄 Propiedades actualizadas"
    );

    loadProperties();
  }
);

// ======================
// 🧠 DETECTAR PROPIEDAD
// ======================
function getPropertyFromMessage(
  message
) {

  const text =
    message.toLowerCase();

  for (
    const property of PROPERTIES
  ) {

    // detectar nombre
    if (
      text.includes(
        property.name.toLowerCase()
      )
    ) {

      return property;
    }

    // detectar keywords
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
// 💰 DETECTAR PRESUPUESTO
// ======================
function extractBudget(message) {

  const text =
    message
      .toLowerCase()
      .replace(/,/g, "")
      .trim();

  console.log(
    "💰 Analizando presupuesto:",
    text
  );

  // millones
  const millionMatch =
    text.match(
      /(\d+(?:\.\d+)?)\s*(millones|millon|mdp)/i
    );

  if (millionMatch) {

    const amount =
      parseFloat(
        millionMatch[1]
      ) * 1000000;

    console.log(
      "✅ Presupuesto detectado:",
      amount
    );

    return amount;
  }

  // cantidades normales
  const numberMatch =
    text.match(
      /\$?\s?(\d{6,9})/
    );

  if (numberMatch) {

    const amount =
      parseInt(
        numberMatch[1]
      );

    console.log(
      "✅ Presupuesto detectado:",
      amount
    );

    return amount;
  }

  return null;
}

// ======================
// 🏡 BUSCAR CASAS
// ======================
function getPropertiesByBudget(
  budget
) {

  return PROPERTIES.filter(
    property => {

      const numericPrice =
        parseInt(
          String(
            property.price
          ).replace(
            /[^0-9]/g,
            ""
          )
        );

      return (
        numericPrice >=
          budget * 0.7 &&
        numericPrice <= budget
      );
    }
  ).slice(0, 5);
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
- NO inventes propiedades.
- NO supongas precios, mensualidades, enganches, tasas o promociones.
- NO preguntes zonas si el cliente ya dio presupuesto.
- Si el cliente menciona presupuesto, muestra directamente opciones disponibles.
- Si no tienes información suficiente o exacta, dilo claramente.
- NO repitas preguntas.
- NO insistas demasiado.
- Responde corto y natural.
- Todas las propiedades están en Villahermosa, Tabasco.

Si no hay propiedades disponibles:
“Por el momento no encontré opciones dentro de ese presupuesto 😊 Un asesor puede ayudarte a revisar más alternativas.”

Si el cliente pide mensualidades o financiamiento:
“Para darte información correcta sobre mensualidades o financiamiento, un asesor puede ayudarte mejor 😊”
`;

// ======================
// ✅ VERIFICAR WEBHOOK
// ======================
app.get(
  "/webhook",
  (req, res) => {

    const mode =
      req.query["hub.mode"];

    const token =
      req.query[
        "hub.verify_token"
      ];

    const challenge =
      req.query[
        "hub.challenge"
      ];

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
  }
);

// ======================
// 📩 WEBHOOK PRINCIPAL
// ======================
app.post(
  "/webhook",
  async (req, res) => {

    try {

      const body =
        req.body;

      fs.writeFileSync(
        "debug.json",
        JSON.stringify(
          body,
          null,
          2
        )
      );

      if (
        body.object === "page"
      ) {

        // ======================
// 📲 WHATSAPP
// ======================
if (
  body.object ===
  "whatsapp_business_account"
) {

  await handleWhatsApp(
    body
  );
}

        for (
          const entry of body.entry || []
        ) {

          if (
            entry.messaging
          ) {

            for (
              const event of entry.messaging
            ) {

              const senderId =
                event.sender?.id;

              if (!senderId)
                continue;

              // ======================
              // 💬 MENSAJES TEXTO
              // ======================
              if (
                event.message?.text
              ) {

                const userMessage =
                  event.message.text;

                console.log(
                  "📩 Mensaje:",
                  userMessage
                );

                // ======================
                // 🏡 DETECTAR CASA EXACTA
                // ======================
                const property =
                  getPropertyFromMessage(
                    userMessage
                  );

                if (property) {

                  console.log(
                    "🏡 Propiedad encontrada:",
                    property.name
                  );

                  // imagen
                  if (
                    property.image
                  ) {

                    await sendImageToMeta(
                      senderId,
                      property.image
                    );
                  }

                  // mensaje
                  const propertyMessage =
`🏡 ${property.name}

💰 Precio: ${property.price}

📍 Ubicación: ${property.location}

¿Te gustaría conocer más detalles o agendar una cita? 😊`;

                  await sendMessageToMeta(
                    senderId,
                    propertyMessage
                  );

                  continue;
                }

                // ======================
                // 💰 DETECTAR PRESUPUESTO
                // ======================
                const budget =
                  extractBudget(
                    userMessage
                  );

                // ======================
                // 🏡 BUSCAR CASAS
                // ======================
                if (budget) {

                  console.log(
                    "💰 Presupuesto encontrado:",
                    budget
                  );

                  const properties =
                    getPropertiesByBudget(
                      budget
                    );

                  // ======================
                  // 🏡 SI HAY RESULTADOS
                  // ======================
                  if (
                    properties.length > 0
                  ) {

                    await sendMessageToMeta(
                      senderId,
                      "😊 Encontré algunas opciones dentro de tu presupuesto:"
                    );

for (
  const property of properties
) {

  // ======================
  // 📸 IMAGEN
  // ======================
  if (
    property.image
  ) {

    await sendImageToMeta(
      senderId,
      property.image
    );
  }

  // ======================
  // 💬 MENSAJE INDIVIDUAL
  // ======================
  const propertyMessage =
`🏡 ${property.name}

💰 ${property.price}

📍 ${property.location}`;

  await sendMessageToMeta(
    senderId,
    propertyMessage
  );
}

// ======================
// 💬 MENSAJE FINAL ÚNICO
// ======================
await sendMessageToMeta(
  senderId,
  "😊 ¿Te gustaría conocer más detalles o agendar una cita?"
);

                    continue;
                  }

                  // ======================
                  // ❌ SIN RESULTADOS
                  // ======================
                  await sendMessageToMeta(
                    senderId,
                    "Por el momento no encontré propiedades dentro de ese presupuesto 😊 Un asesor puede ayudarte a revisar más opciones disponibles."
                  );

                  continue;
                }

                // ======================
                // 🤖 IA
                // ======================
                let replyText =
                  "😊 ¿Tienes algún presupuesto aproximado o algún modelo de casa que te interese?";

                try {

                  const response =
                    await openai.responses.create({
                      model:
                        "gpt-4.1-mini",
                      input: [
                        {
                          role:
                            "system",
                          content:
                            SYSTEM_PROMPT,
                        },
                        {
                          role:
                            "user",
                          content:
                            userMessage,
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
                // 📲 LINK ASESOR
                // ======================
                if (
                  userMessage
                    .toLowerCase()
                    .includes(
                      "asesor"
                    ) ||

                  userMessage
                    .toLowerCase()
                    .includes(
                      "cita"
                    )
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
  }
);

// ======================
// 📤 ENVIAR MENSAJE
// ======================
async function sendMessageToMeta(
  psid,
  text
) {

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
      error.response?.data ||
        error.message
    );
  }
}

// ======================
// 🖼️ ENVIAR IMAGEN
// ======================
async function sendImageToMeta(
  psid,
  imageUrl
) {

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
      error.response?.data ||
        error.message
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