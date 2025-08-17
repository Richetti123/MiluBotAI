import { generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { smsg } from './lib/simple.js';
import { format } from 'util';
import { fileURLToPath } from 'url';
import path from 'path';
import fs, { watchFile, unwatchFile } from 'fs';
import fetch from 'node-fetch';
import { handlePaymentProofButton, manejarRespuestaPago } from './lib/respuestapagos.js';
import { handleIncomingMedia } from './lib/comprobantes.js';
import { isPaymentProof } from './lib/keywords.js';
import { handler as clienteHandler } from './plugins/cliente.js';
import { handler as historialPagosHandler } from './plugins/historialpagos.js';
import { handler as pagosMesHandler } from './plugins/pagosmes.js';
import { handler as pagosAtrasadosHandler } from './plugins/pagosatrasados.js';
import { handler as recordatorioLoteHandler } from './plugins/recordatoriolote.js';
import { handler as suspenderActivarHandler } from './plugins/suspenderactivar.js';
import { handler as modoPagoHandler } from './plugins/modopago.js';
import { handler as estadoBotHandler } from './plugins/estadobot.js';
import { handler as bienvenidaHandler } from './plugins/bienvenida.js';
import { handler as despedidaHandler } from './plugins/despedida.js';
import { handler as derivadosHandler } from './plugins/derivados.js';
import { handler as ayudaHandler } from './plugins/comandos.js';
import { handler as getfaqHandler } from './lib/getfaq.js';
import { handler as faqHandler } from './plugins/faq.js';
import { handler as importarPagosHandler } from './plugins/importarpagos.js';
import { handler as resetHandler } from './plugins/reset.js';
import { handler as notificarOwnerHandler } from './plugins/notificarowner.js';
import { handler as registrarPagoHandler } from './plugins/registrarpago.js';
import { handler as registrarLoteHandler } from './plugins/registrarlote.js';
import { handler as enviarReciboHandler } from './plugins/recibo.js';
import { handler as recordatorioHandler } from './plugins/recordatorios.js';
import { handler as comprobantePagoHandler } from './plugins/comprobantepago.js';
import { handler as updateHandler } from './plugins/update.js';
import { handler as subirComprobanteHandler } from './plugins/subircomprobante.js';
import { handleListButtonResponse } from './lib/listbuttons.js';
import { handler as editarstockHandler } from './plugins/editarstock.js';
import { handler as editarprecioHandler } from './plugins/editarprecio.js';
import chalk from 'chalk';

const normalizarNumero = (numero) => {
    if (!numero) return numero;
    const sinMas = numero.replace('+', '');
    if (sinMas.startsWith('521') && sinMas.length === 13) {
        return '+52' + sinMas.slice(3);
    }
    return numero.startsWith('+') ? numero : '+' + numero;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_OWNER_NUMBER = '5492213165900';
const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;
const RESET_INTERVAL_MS = 12 * 60 * 60 * 1000;

const inactivityTimers = {};
let hasResetOnStartup = false;
let lastResetTime = Date.now();

const isNumber = x => typeof x === 'number' && !isNaN(x);
const delay = ms => isNumber(ms) && new Promise(resolve => setTimeout(function () {
    clearTimeout(this);
}, ms));

const configBotPath = path.join(__dirname, 'src', 'configbot.json');
const paymentsFilePath = path.join(__dirname, 'src', 'pagos.json');
const chatDataPath = path.join(__dirname, 'src', 'chat_data.json');

const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        try {
            return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
        } catch (e) {
            console.error(chalk.red(`[ERROR] Error al parsear configbot.json: ${e.message}`));
            return {
                modoPagoActivo: false,
                mensajeBienvenida: "¡Hola {user}! Soy tu bot asistente de pagos. ¿En qué puedo ayudarte hoy?",
                mensajeDespedida: "¡Hasta pronto! Esperamos verte de nuevo.",
                services: {},
                mensajeDespedidaInactividad: "Parece que la conversación terminó. Soy tu asistente MiluAI. ¿Necesitas algo más? Puedes reactivar la conversación enviando un nuevo mensaje o tocando el botón.",
                chatGreeting: "¡Hola! Soy MiluAI, tu asistente virtual, y estoy aquí para ayudarte. 😊✨ Por favor, indícame tu nombre para poder ofrecerte los servicios disponibles. ¡Estoy listo para atenderte! 🤖💬"
            };
        }
    }
    return {
        modoPagoActivo: false,
        mensajeBienvenida: "¡Hola {user}! Soy tu bot asistente de pagos. ¿En qué puedo ayudarte hoy?",
        mensajeDespedida: "¡Hasta pronto! Esperamos verte de nuevo.",
        services: {},
        mensajeDespedidaInactividad: "Parece que la conversación terminó. Soy tu asistente MiluAI. ¿Necesitas algo más? Puedes reactivar la conversación enviando un nuevo mensaje o tocando el botón.",
        chatGreeting: "¡Hola! Soy MiluAI, tu asistente virtual, y estoy aquí para ayudarte. 😊✨ Por favor, indícame tu nombre para poder ofrecerte los servicios disponibles. ¡Estoy listo para atenderte! 🤖💬"
    };
};

const saveConfigBot = (config) => {
    if (config !== undefined && config !== null) {
        fs.writeFileSync(configBotPath, JSON.stringify(config, null, 2), 'utf8');
    } else {
        console.error(chalk.red('[ERROR] No se pudo guardar configbot.json: los datos son undefined o null.'));
    }
};

const loadChatData = () => {
    if (fs.existsSync(chatDataPath)) {
        try {
            return JSON.parse(fs.readFileSync(chatDataPath, 'utf8'));
        } catch (e) {
            console.error(chalk.red(`[ERROR] Error al parsear chat_data.json: ${e.message}`));
            return {};
        }
    }
    return {};
};

const saveChatData = (data) => {
    if (data !== undefined && data !== null) {
        fs.writeFileSync(chatDataPath, JSON.stringify(data, null, 2), 'utf8');
    } else {
        console.error(chalk.red('[ERROR] No se pudo guardar chat_data.json: los datos son undefined o null.'));
    }
};

const loadPaymentsData = () => {
    if (fs.existsSync(paymentsFilePath)) {
        try {
            return JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
        } catch (e) {
            console.error(chalk.red(`[ERROR] Error al parsear pagos.json: ${e.message}`));
            return {};
        }
    }
    return {};
};

const savePaymentsData = (data) => {
    if (data !== undefined && data !== null) {
        fs.writeFileSync(paymentsFilePath, JSON.stringify(data, null, 2), 'utf8');
    } else {
        console.error(chalk.red('[ERROR] No se pudo guardar pagos.json: los datos son undefined o null.'));
    }
};

const countryPaymentMethods = {
    'méxico': `\n\nPara pagar en México, usa:\n722969020694617538\nMercado Pago Wallet\nSarai Ortega Góngora\nConcepto: préstamo/escuela\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
    'perú': `\n\nPara pagar en Perú, usa:\nNombre: Nicole A.\nYape: 904521589\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
    'mexico': `\n\nPara pagar en México, usa:\n722969020694617538\nMercado Pago Wallet\nSarai Ortega Góngora\nConcepto: préstamo/escuela\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
    'peru': `\n\nPara pagar en Perú, usa:\nNombre: Nicole A.\nYape: 904521589\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
    'chile': `\n\nPara pagar en Chile, usa:\nNombre: BARINIA VALESKA ZENTENO MERINO\nRUT: 17053067-5\nBANCO ELEGIR: TEMPO\nTipo de cuenta: Cuenta Vista\nNumero de cuenta: 111117053067\nCorreo: estraxer2002@gmail.com\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
    'argentina': `\n\nPara pagar en Argentina, usa:\nNombre: Milagros Flores\nCBU: 4530000800016108966889\nALIAS: miluu.912\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
    'bolivia': ``,
    'españa': ``,
    'brasil': ``,
    'paypal': ``,
    'estados unidos': ``,
    'puerto rico': ``,
    'uruguay': `\n\nPara pagar en Uruguay, usa:\n1691414\nGaston Juarez\nPREX\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
    'paraguay': `\n\nPara pagar en paraguay, usa:\nMaría Isabel Cogorno Rojas\nC.I N.  4.627.087\nTelefono 0984-854-037\nUeno Bank. 619345391\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
    'colombia': ``
};

const handleInactivity = async (m, conn, userId) => {
    try {
        const currentConfigData = loadConfigBot();
        const farewellMessage = currentConfigData.mensajeDespedidaInactividad
            .replace(/{user}/g, m.pushName || (m.sender ? m.sender.split('@')[0] : 'usuario'))
            .replace(/{bot}/g, conn.user.name || 'Bot');

        const sections = [{
            title: '❓ Retomar Conversación',
            rows: [{
                title: '➡️ Reactivar Chat',
                rowId: `.reactivate_chat`,
                description: 'Pulsa aquí para iniciar una nueva conversación.'
            }]
        }];

        const listMessage = {
            text: farewellMessage,
            footer: 'Toca el botón para reactivar la conversación.',
            title: '👋 *Hasta Pronto*',
            buttonText: 'Retomar Conversación',
            sections
        };
        await conn.sendMessage(m.chat, listMessage, { quoted: m });

        await new Promise((resolve, reject) => {
            global.db.data.users.update({ id: userId }, { $set: { chatState: 'initial' } }, {}, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
        delete inactivityTimers[userId];

    } catch (e) {
        console.error(`[ERROR] en handleInactivity: ${e.message}`);
    }
};

const handleGoodbye = async (m, conn, userId) => {
    try {
        await handleInactivity(m, conn, userId);
    } catch (e) {
        console.error(`[ERROR] en handleGoodbye: ${e.message}`);
    }
};

const sendWelcomeMessage = async (m, conn) => {
    const currentConfigData = loadConfigBot();
    const chatData = loadChatData();
    const formattedSender = normalizarNumero(`+${m.sender.split('@')[0]}`);
    const userChatData = chatData[formattedSender] || {};
    let welcomeMessage = '';

    if (!userChatData.nombre) {
        welcomeMessage = "¡Hola! MiluAI, tu asistente virtual, y estoy aquí para ayudarte. 😊✨ Por favor, indícame tu nombre para poder ofrecerte los servicios disponibles. ¡Estoy listo para atenderte! 🤖💬";
        await m.reply(welcomeMessage);

        await new Promise((resolve, reject) => {
            global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'awaitingName' } }, { upsert: true }, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });

    } else {
        welcomeMessage = `¡Hola ${userChatData.nombre}! ¿En qué puedo ayudarte hoy?`;

        const categories = Object.keys(currentConfigData.services);
        const sections = [{
            title: "✨ Servicios Disponibles ✨",
            rows: categories.map(category => {
                let buttonTitle = category;
                let buttonDescription = "Haz clic para ver los servicios.";

                switch (category) {
                    case "Spam":
                        buttonTitle = "📧Spam";
                        buttonDescription = "Perfiles de streaming exclusivos para ti.";
                        break;
                    case "Combos":
                        buttonTitle = "📦Combos";
                        buttonDescription = "Cuentas con acceso total para compartir.";
                        break;
                    case "Bot de etiquetas mensual":
                        buttonTitle = "🤖Bot de etiquetas mensual";
                        buttonDescription = "Planes premium para tus plataformas de música.";
                        break;
                    case "Bot de etiquetas permanente":
                        buttonTitle = "🤖Bot de etiquetas permanente";
                        buttonDescription = "Accede a plantillas y herramientas premium.";
                        break;
                }

                return {
                    title: buttonTitle,
                    description: buttonDescription,
                    rowId: `category:${category}`
                };
            })
        }];

        const listMessage = {
            text: welcomeMessage,
            footer: 'Toca el botón para ver nuestros servicios.',
            title: '📚 *Bienvenido/a*',
            buttonText: 'Ver Catálogo',
            sections
        };
        await conn.sendMessage(m.chat, listMessage, { quoted: m });

        await new Promise((resolve, reject) => {
            global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'active' } }, {}, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    }
};

const sendPaymentOptions = async (m, conn) => {
    const paymentMessage = 'Selecciona la opción que deseas:';
    const buttons = [
        { buttonId: '1', buttonText: { displayText: 'He realizado el pago' }, type: 1 },
        { buttonId: '2', buttonText: { displayText: 'Necesito ayuda con mi pago' }, type: 1 }
    ];
    const buttonMessage = {
        text: paymentMessage,
        buttons: buttons,
        headerType: 1
    };

    await conn.sendMessage(m.chat, buttonMessage, { quoted: m });

    await new Promise((resolve, reject) => {
        global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'awaitingPaymentResponse' } }, {}, (err) => {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
};

const serviceEmojis = {
    "Netflix Extra (Privado)": "🎬",
    "Disney Premium": "🌟",
    "Max Estándar": "📽️",
    "Max Platino": "💎",
    "Prime Video Sin Anuncios": "📦",
    "Paramount": "🎥",
    "Vix 1 Mes": "📅",
    "Vix 2 Meses": "🗓️",
    "Crunchyroll": "🍜",
    "Claro Video con Canales": "📺",
    "Viki Rakuten": "🎭",
    "Duolingo Individual": "📚",
    "Pornhub": "🔞",
    "Plex": "📂",
    "Claro video con Paramount": "🎩",
    "Claro video con Universal": "♻️",
    "Netflix": "🍿",
    "Disney Estándar C/A": "📢",
    "Prime Sin Anuncios": "📦✨",
    "Spotify Premium 1 Mes (Renovable)": "🎶",
    "Spotify Premium 2 Meses (Renovable)": "🎵",
    "Spotify Premium 3 Meses (Renovable)": "🎤",
    "YouTube por Invitación (Un Mes)": "📺",
    "YouTube por Invitación (Dos Meses)": "🎤",
    "YouTube Familiar Un Mes (A Tus Datos)": "👨‍👩‍👧‍👦",
    "Mubi": "🎧",
    "1 Mes": "🎨",
    "2 Meses": "🖌️",
    "3 Meses": "🎉",
    "6 Meses": "📅",
    "1 Año": "🎁",
    "Invitación Office (Un mes)": "📄",
    "Invitación Gemini": "👾",
    "Invitación Tidal": "💿",
    "Invitación Deezer": "🎙️",
    "Invitación Chat GTP": "📼",
    "Piscard": "🖌️",
    "Scribd": "✍️",
    "Brazzer": "🔞"
};

export async function handler(m, conn, store) {
    if (!m) return;
    if (m.key.fromMe) return;

    if (!hasResetOnStartup) {
        const allUsers = await new Promise((resolve, reject) => {
            global.db.data.users.find({}, (err, docs) => {
                if (err) return reject(err);
                resolve(docs);
            });
        });
        if (allUsers.length > 0) {
            await new Promise((resolve, reject) => {
                global.db.data.users.update({}, { $set: { chatState: 'initial' } }, { multi: true }, (err, numReplaced) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }
        hasResetOnStartup = true;
        lastResetTime = Date.now();
    } else if (Date.now() - lastResetTime > RESET_INTERVAL_MS) {
        const allUsers = await new Promise((resolve, reject) => {
            global.db.data.users.find({}, (err, docs) => {
                if (err) return reject(err);
                resolve(docs);
            });
        });
        if (allUsers.length > 0) {
            await new Promise((resolve, reject) => {
                global.db.data.users.update({}, { $set: { chatState: 'initial' } }, { multi: true }, (err, numReplaced) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }
        lastResetTime = Date.now();
    }

    const isGroup = m.key.remoteJid?.endsWith('@g.us');
    const botJid = conn?.user?.id || conn?.user?.jid || '';
    const botRaw = botJid?.split('@')[0] || 'Desconocido';
    const botNumber = botRaw.split(':')[0];
    const botIdentifier = '+' + botNumber;

    const senderJid = m.key?.fromMe ? botJid : m.key?.participant || m.key?.remoteJid || m.sender || '';
    const senderRaw = senderJid.split('@')[0] || 'Desconocido';
    const senderNumber = '+' + senderRaw.split(':')[0];

    const senderName = m.pushName || 'Desconocido';

    let chatName = 'Chat Privado';
    if (isGroup) {
        try {
            chatName = await conn.groupMetadata(m.key.remoteJid).then(res => res.subject);
        } catch (_) {
            chatName = 'Grupo Desconocido';
        }
    }
    
    const groupLine = isGroup ? `Grupo: ${chatName}` : `Chat: Chat Privado`;

    const rawText =
        m.text ||
        m.message?.conversation ||
        m.message?.extendedTextMessage?.text ||
        m.message?.imageMessage?.caption ||
        '';

    const commandForLog = rawText && m.prefix && rawText.startsWith(m.prefix) ? rawText.split(' ')[0] : null;
    const actionText = m.fromMe ? 'Mensaje Enviado' : (commandForLog ? `Comando: ${commandForLog}` : 'Mensaje');
    const messageType = Object.keys(m.message || {})[0] || 'desconocido';

    console.log(
        chalk.hex('#FF8C00')(`╭━━━━━━━━━━━━━━𖡼`) + '\n' +
        chalk.white(`┃ ❖ Bot: ${chalk.cyan(botIdentifier)} ~ ${chalk.cyan(conn.user?.name || 'Bot')}`) + '\n' +
        chalk.white(`┃ ❖ Horario: ${chalk.greenBright(new Date().toLocaleTimeString())}`) + '\n' +
        chalk.white(`┃ ❖ Acción: ${chalk.yellow(actionText)}`) + '\n' +
        chalk.white(`┃ ❖ Usuario: ${chalk.blueBright(senderNumber)} ~ ${chalk.blueBright(senderName)}`) + '\n' +
        chalk.white(`┃ ❖ ${groupLine}`) + '\n' +
        chalk.white(`┃ ❖ Tipo de mensaje: [${m.fromMe ? 'Enviado' : 'Recibido'}] ${chalk.red(messageType)}`) + '\n' +
        chalk.hex('#FF8C00')(`╰━━━━━━━━━━━━━━𖡼`) + '\n' +
        chalk.white(`${rawText.trim() || ' (Sin texto legible) '}`)
    );
    try {
        if (m.key.id.startsWith('BAE5') && m.key.id.length === 16) return;
        if (m.key.remoteJid === 'status@broadcast') return;

        m = smsg(conn, m);

        const ownerJid = `${BOT_OWNER_NUMBER}@s.whatsapp.net`;
        m.isOwner = m.isGroup ? m.key.participant === ownerJid : m.sender === ownerJid;
        m.prefix = '.';

        if (!m.isGroup) {
            if (inactivityTimers[m.sender]) {
                clearTimeout(inactivityTimers[m.sender]);
            }
            inactivityTimers[m.sender] = setTimeout(() => {
                handleInactivity(m, conn, m.sender);
            }, INACTIVITY_TIMEOUT_MS);
        }

        if (m.message) {
            let buttonReplyHandled = false;
            let selectedRowId = null;

            if (m.message.buttonsResponseMessage && m.message.buttonsResponseMessage.selectedButtonId) {
                selectedRowId = m.message.buttonsResponseMessage.selectedButtonId;
                buttonReplyHandled = true;
            } else if (m.message.templateButtonReplyMessage && m.message.templateButtonReplyMessage.selectedId) {
                selectedRowId = m.message.templateButtonReplyMessage.selectedId;
                buttonReplyHandled = true;
            } else if (m.message.listResponseMessage && m.message.listResponseMessage.singleSelectReply) {
                selectedRowId = m.message.listResponseMessage.singleSelectReply.selectedRowId;
                buttonReplyHandled = true;
            }

            if (buttonReplyHandled) {
                m.text = selectedRowId;

                try {
                    if (selectedRowId === '1' || selectedRowId.toLowerCase() === 'he realizado el pago') {
                        await conn.sendMessage(m.chat, {
                            text: `✅ *Si ya ha realizado su pago, por favor enviar foto o documento de su pago con el siguiente texto:*\n\n*"Aquí está mi comprobante de pago"* 📸`
                        });
                        if (m.sender) {
                            await new Promise((resolve, reject) => {
                                global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'awaitingPaymentProof' } }, { upsert: true }, (err) => {
                                    if (err) {
                                        return reject(err);
                                    }
                                    resolve();
                                });
                            });
                        }
                        return;
                    }

                    if (selectedRowId === '.reactivate_chat') {
                        await sendWelcomeMessage(m, conn);
                        return;
                    }

                    if (selectedRowId.startsWith('category:')) {
                        const categoryName = selectedRowId.replace('category:', '').trim();
                        const currentConfigData = loadConfigBot();
                        const services = currentConfigData.services || {};
                        const categoryServices = services[categoryName];

                        if (categoryServices && categoryServices.length > 0) {
                            const sections = [{
                                title: `Catálogo de ${categoryName}`,
                                rows: categoryServices.map(service => {
                                    const emoji = serviceEmojis[service.pregunta] || '⭐';
                                    const stockInfo = service.stock !== undefined ? ` | 📦Stock: ${service.stock}` : '';
                                    return {
                                        title: `${emoji} ${service.pregunta}`,
                                        description: `💰 Precio: ${service.precio} ${stockInfo}`,
                                        rowId: `!getfaq ${service.id}`
                                    };
                                })
                            }];

                            const listMessage = {
                                text: `Aquí están todos los servicios en la categoría de *${categoryName}*.`,
                                title: "✨ Nuestros Servicios",
                                buttonText: "Seleccionar Servicio",
                                sections
                            };

                            await conn.sendMessage(m.chat, listMessage, { quoted: m });
                        } else {
                            await m.reply(`❌ No hay servicios disponibles en la categoría de *${categoryName}*.`);
                        }
                        return;
                    }

                    if (selectedRowId.startsWith('!getfaq')) {
                        const serviceId = selectedRowId.replace('!getfaq ', '').trim();
                        const chatData = loadChatData();
                        const formattedSender = normalizarNumero(`+${m.sender.split('@')[0]}`);

                        if (!chatData[formattedSender]) {
                            chatData[formattedSender] = {};
                        }
                        chatData[formattedSender].lastSelectedServiceId = serviceId;
                        saveChatData(chatData);
                        try {
                            await getfaqHandler(m, { conn, text: serviceId, command: 'getfaq', usedPrefix: m.prefix });
                        } catch (getfaqError) {
                            console.error(chalk.red(`[ERROR] en getfaqHandler: ${getfaqError.message}`));
                            await m.reply('❌ Ha ocurrido un error al obtener la información del servicio. Por favor, inténtalo de nuevo más tarde.');
                        }
                        return;
                    }

                    if (selectedRowId.startsWith('accept_') || selectedRowId.startsWith('reject_') || selectedRowId.startsWith('confirm_sale_') || selectedRowId.startsWith('no_sale_')) {
                        if (m.isOwner) {
                            const clientJid = selectedRowId.replace(/^(accept_payment_|reject_payment_)/, '');
                            const paymentsData = loadPaymentsData();
                            const lastSelectedServiceId = paymentsData[normalizarNumero(`+${clientJid.split('@')[0]}`)]?.lastSelectedServiceId;
                            const handledByPaymentProof = await handlePaymentProofButton(m, conn, lastSelectedServiceId);
                            if (handledByPaymentProof) {
                                return;
                            }
                        }
                    }

                    const handledByManejarRespuestaPago = await manejarRespuestaPago(m, conn);
                    if (handledByManejarRespuestaPago) {
                        return;
                    }

                } catch (e) {
                    console.error(`[ERROR] en el manejo de botones en handler.js: ${e.message}`);
                    m.reply('Lo siento, ha ocurrido un error al procesar la acción del botón. Por favor, inténtalo de nuevo.');
                    return;
                }
            }
        }

        if (m.message?.imageMessage && !m.message?.imageMessage?.caption) {
            await m.reply("Si estas intentando mandar un comprobante de pago por favor envialo junto con el texto \"Aquí está mi comprobante de pago\"");
            return;
        }

        const esImagenConComprobante = m.message?.imageMessage?.caption && isPaymentProof(m.message.imageMessage.caption);
        const esDocumentoConComprobante = m.message?.documentMessage?.caption && isPaymentProof(m.message.documentMessage.caption);

        if (esImagenConComprobante || esDocumentoConComprobante) {
            const paymentsData = loadPaymentsData();
            const chatData = loadChatData();
            const formattedSender = normalizarNumero(`+${m.sender.split('@')[0]}`);
            const userChatData = chatData[formattedSender] || {};

            let clientInfo = null;

            try {
                if (fs.existsSync(paymentsFilePath)) {
                    const clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
                    clientInfo = clientsData[formattedSender];
                }
            } catch (e) {
                console.error(chalk.red("Error al leer pagos.json en handler.js (comprobante):", e));
            }

            if (userChatData.lastSelectedServiceId) {
                if (!paymentsData[formattedSender]) {
                    paymentsData[formattedSender] = {};
                }
                paymentsData[formattedSender].lastSelectedServiceId = userChatData.lastSelectedServiceId;
                savePaymentsData(paymentsData);
                const handledMedia = await handleIncomingMedia(m, conn, clientInfo, userChatData.lastSelectedServiceId);
                if (handledMedia) {
                    return;
                }
            } else {
                await m.reply('❌ No se encontró el último servicio seleccionado. Por favor, elige un servicio del menú principal antes de enviar tu comprobante de pago.');
                return;
            }
        }

        if (m.text && m.text.startsWith(m.prefix)) {
            m.isCmd = true;
            m.command = m.text.slice(m.prefix.length).split(' ')[0].toLowerCase();
        }

        if (m.isCmd) {
            if (!m.isGroup) {
                const commandText = m.text.slice(m.text.startsWith(m.prefix) ? m.prefix.length + m.command.length : m.command.length).trim();
                switch (m.command) {
                    case 'registrarpago':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await registrarPagoHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'registrarlote':
                    case 'agregarclientes':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await registrarLoteHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'recibo':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await enviarReciboHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'recordatorio':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await recordatorioHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'clientes':
                    case 'listarpagos':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        if (fs.existsSync(paymentsFilePath)) {
                            const clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
                            let clientList = '📊 *Lista de Clientes y Pagos:*\n\n';
                            for (const num in clientsData) {
                                const client = clientsData[num];
                                const estadoPago = client.pagoRealizado ? '✅ Pagado este mes' : '❌ Pendiente de pago';
                                const pagoActual = client.pagos && client.pagos[0] ? client.pagos[0] : { monto: 'N/A' };

                                clientList += `*👤 Nombre:* ${client.nombre}\n*📞 Número:* ${num}\n*🗓️ Día de Pago:* ${client.diaPago}\n*💰 Monto:* ${pagoActual.monto}\n*🌎 Bandera:* ${client.bandera}\n*• Estado de Suspensión:* ${client.suspendido ? '🔴 Suspendido' : '🟢 Activo'}\n----------------------------\n`;
                            }
                            if (Object.keys(clientsData).length === 0) clientList = '❌ No hay clientes registrados.';
                            await conn.sendMessage(m.chat, { text: clientList }, { quoted: m });
                        } else {
                            await conn.sendMessage(m.chat, { text: '❌ El archivo `pagos.json` no se encontró. No hay clientes registrados.' }, { quoted: m });
                        }
                        break;
                    case 'cliente':
                    case 'vercliente':
                    case 'editarcliente':
                    case 'eliminarcliente':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await clienteHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'historialpagos':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await historialPagosHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'pagosmes':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await pagosMesHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'pagosatrasados':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await pagosAtrasadosHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'recordatoriolote':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await recordatorioLoteHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'suspendercliente':
                    case 'activarcliente':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await suspenderActivarHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'modopago':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await modoPagoHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner, currentConfigData: loadConfigBot(), saveConfigBot });
                        break;
                    case 'estadobot':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await estadoBotHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'bienvenida':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await bienvenidaHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner, currentConfigData: loadConfigBot(), saveConfigBot });
                        break;
                    case 'despedida':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await despedidaHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner, currentConfigData: loadConfigBot(), saveConfigBot });
                        break;
                    case 'derivados':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await derivadosHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'ayuda':
                    case 'comandos':
                        await ayudaHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                        break;
                    case 'faq':
                    case 'eliminarfaq':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await faqHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'importarpagos':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await importarPagosHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'reset':
                        await resetHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                        break;
                    case 'comprobantepago':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await comprobantePagoHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'consulta':
                        break;
                    case 'update':
                    case 'actualizar':
                    case 'gitpull':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await updateHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'subircomprobante':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await subirComprobanteHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'editarstock':
                        await editarstockHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'editarprecio':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await editarprecioHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    default:
                        break;
                }
            }
            return;
        }

        if (m.key.fromMe && m.isOwner) {
            if (m.text && (m.text.startsWith('confirm_sale_') || m.text.startsWith('no_sale_'))) {
                await handlePaymentProofButton(m, conn);
                return;
            }
        }

        if (!m.isGroup) {
            const currentConfigData = loadConfigBot();
            const services = currentConfigData.services || {};
            const chatData = loadChatData();
            const formattedSender = normalizarNumero(`+${m.sender.split('@')[0]}`);
            const userChatData = chatData[formattedSender] || {};
            const messageTextLower = m.text.toLowerCase().trim();

            const user = await new Promise((resolve, reject) => {
                global.db.data.users.findOne({ id: m.sender }, (err, doc) => {
                    if (err) {
                        return resolve(null);
                    }
                    resolve(doc);
                });
            });

            const chatState = user?.chatState || 'initial';

            if (isPaymentProof(messageTextLower) && (m.message?.imageMessage || m.message?.documentMessage)) {
                return;
            }

            if (chatState === 'initial') {
                const chatData = loadChatData();
                const formattedSender = normalizarNumero(`+${m.sender.split('@')[0]}`);
                const userChatData = chatData[formattedSender] || {};

                if (userChatData.nombre) {
                    await new Promise((resolve, reject) => {
                        global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'active' } }, { upsert: true }, (err) => {
                            if (err) {
                                return reject(err);
                            }
                            resolve();
                        });
                    });

                    const categories = Object.keys(currentConfigData.services);
                    const sections = [{
                        title: "✨ Servicios Disponibles ✨",
                        rows: categories.map(category => {
                            let buttonTitle = category;
                            let buttonDescription = "Haz clic para ver los servicios.";

                            switch (category) {
                                case "Spam":
                                    buttonTitle = "📧Spam";
                                    buttonDescription = "Servicios de spam";
                                    break;
                                case "Combos":
                                    buttonTitle = "📦Combos";
                                    buttonDescription = "Combos de renovacion";
                                    break;
                                case "Bot de etiquetas mensual":
                                    buttonTitle = "🤖Bot de etiquetas mensual";
                                    buttonDescription = "Bot para tus grupos de pago mensual";
                                    break;
                                case "Bot de etiquetas permanente":
                                    buttonTitle = "🤖Bot de etiquetas permanente";
                                    buttonDescription = "Bot para tus grupos unico pago";
                                    break;
                                case "Numeros virtuales":
                                    buttonTitle = "#️⃣Numeros virtuales";
                                    buttonDescription = "Numeros virtuales antidoxeo";
                                    break;
                            }

                            return {
                                title: buttonTitle,
                                description: buttonDescription,
                                rowId: `category:${category}`
                            };
                        })
                    }];

                    const listMessage = {
                        text: `¡Hola ${userChatData.nombre}! ¿En qué puedo ayudarte hoy?`,
                        footer: 'Toca el botón para ver nuestros servicios.',
                        title: '📚 *Bienvenido/a*',
                        buttonText: 'Ver Catálogo',
                        sections
                    };
                    await conn.sendMessage(m.chat, listMessage, { quoted: m });

                    return;
                } else {
                    await sendWelcomeMessage(m, conn);
                    return;
                }
            } else if (chatState === 'awaitingName') {
                if (messageTextLower.length > 0) {
                    let name = '';
                    const soyMatch = messageTextLower.match(/^(?:soy|me llamo)\s+(.*?)(?:\s+y|\s+quiero|$)/);
                    const nombreEsMatch = messageTextLower.match(/^mi nombre es\s+(.*?)(?:\s+y|\s+quiero|$)/);

                    if (soyMatch && soyMatch[1]) {
                        name = soyMatch[1].trim();
                    } else if (nombreEsMatch && nombreEsMatch[1]) {
                        name = nombreEsMatch[1].trim();
                    } else {
                        name = messageTextLower.split(' ')[0];
                    }

                    if (name) {
                        const formattedSenderForSave = normalizarNumero(`+${m.sender.split('@')[0]}`);
                        userChatData.nombre = name.charAt(0).toUpperCase() + name.slice(1);

                        chatData[formattedSenderForSave] = userChatData;
                        saveChatData(chatData);

                        await new Promise((resolve, reject) => {
                            global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'active', nombre: userChatData.nombre } }, { upsert: true }, (err) => {
                                if (err) {
                                    return reject(err);
                                }
                                resolve();
                            });
                        });

                        const categories = Object.keys(currentConfigData.services);
                        const sections = [{
                            title: "✨ Servicios Disponibles ✨",
                            rows: categories.map(category => {
                                let buttonTitle = category;
                                let buttonDescription = "Haz clic para ver los servicios.";

                                switch (category) {
                                    case "Spam":
                                        buttonTitle = "📧Spam";
                                        buttonDescription = "Servicios de spam";
                                        break;
                                    case "Combos":
                                        buttonTitle = "📦Combos";
                                        buttonDescription = "Combos de renovacion";
                                        break;
                                    case "Bot de etiquetas mensual":
                                        buttonTitle = "🤖Bot de etiquetas mensual";
                                        buttonDescription = "Bot para tus grupos de pago mensual";
                                        break;
                                    case "Bot de etiquetas permanente":
                                        buttonTitle = "🤖Bot de etiquetas permanente";
                                        buttonDescription = "Bot para tus grupos unico pago";
                                        break;
                                    case "Numeros virtuales":
                                        buttonTitle = "#️⃣Numeros virtuales";
                                        buttonDescription = "Numeros virtuales antidoxeo";
                                        break;
                                }

                                return {
                                    title: buttonTitle,
                                    description: buttonDescription,
                                    rowId: `category:${category}`
                                };
                            })
                        }];

                        const listMessage = {
                            text: `¡Hola ${userChatData.nombre}! ¿En qué puedo ayudarte hoy?`,
                            footer: 'Toca el botón para ver nuestros servicios.',
                            title: '📚 *Bienvenido/a*',
                            buttonText: 'Ver Catálogo',
                            sections
                        };
                        await conn.sendMessage(m.chat, listMessage, { quoted: m });

                        return;
                    }
                }
            } else if (chatState === 'active') {
                const command = m.text ? m.text.toLowerCase().trim() : '';
                if (command === 'menu' || command === 'ayuda' || command === 'servicios') {
                    const categories = Object.keys(currentConfigData.services);
                    const sections = [{
                        title: "✨ Servicios Disponibles ✨",
                        rows: categories.map(category => {
                            let buttonTitle = category;
                            let buttonDescription = "Haz clic para ver los servicios.";

                            switch (category) {
                                case "Spam":
                                    buttonTitle = "📧Spam";
                                    buttonDescription = "Servicios de spam";
                                    break;
                                case "Combos":
                                    buttonTitle = "📦Combos";
                                    buttonDescription = "Combos de renovacion";
                                    break;
                                case "Bot de etiquetas mensual":
                                    buttonTitle = "🤖Bot de etiquetas mensual";
                                    buttonDescription = "Bot para tus grupos de pago mensual";
                                    break;
                                case "Bot de etiquetas permanente":
                                    buttonTitle = "🤖Bot de etiquetas permanente";
                                    buttonDescription = "Bot para tus grupos unico pago";
                                    break;
                                case "Numeros virtuales":
                                    buttonTitle = "#️⃣Numeros virtuales";
                                    buttonDescription = "Numeros virtuales antidoxeo";
                                    break;
                            }

                            return {
                                title: buttonTitle,
                                description: buttonDescription,
                                rowId: `category:${category}`
                            };
                        })
                    }];

                    const listMessage = {
                        text: `¡Hola ${userChatData.nombre}! ¿En qué puedo ayudarte hoy?`,
                        title: "Menú Principal",
                        buttonText: "Ver Catálogo",
                        sections
                    };

                    await conn.sendMessage(m.chat, listMessage, { quoted: m });
                    return;
                }

                const goodbyeKeywords = ['adios', 'chao', 'chau', 'bye', 'nos vemos', 'hasta luego', 'me despido', 'adiòs', 'adiós'];
                const isGoodbye = goodbyeKeywords.some(keyword => messageTextLower.includes(keyword));

                if (isGoodbye) {
                    await handleGoodbye(m, conn, m.sender);
                    return;
                }

                if (m.text.startsWith('!getfaq')) {
                    try {
                        await getfaqHandler(m, { conn, text: m.text.replace('!getfaq ', ''), command: 'getfaq', usedPrefix: m.prefix });
                    } catch (getfaqError) {
                        console.error(chalk.red(`[ERROR] en getfaqHandler (desde texto): ${getfaqError.message}`));
                        await m.reply('❌ Ha ocurrido un error al obtener la información del servicio. Por favor, inténtalo de nuevo más tarde.');
                    }
                    return;
                }

                const paises = Object.keys(countryPaymentMethods);
                const paisEncontrado = paises.find(p => messageTextLower.includes(p));

                if (paisEncontrado) {
                    const formattedSender = normalizarNumero(`+${m.sender.split('@')[0]}`);
                    const chatData = loadChatData();
                    const userChatData = chatData[formattedSender] || {};

                    if (!userChatData.lastSelectedServiceId) {
                         await m.reply('⚠️ Antes de realizar tu pago, por favor, selecciona el servicio que deseas adquirir desde el menú principal. Luego, vuelve a preguntar por el método de pago.');
                         return;
                     }
                    const metodoPago = countryPaymentMethods[paisEncontrado];
                    if (metodoPago && metodoPago.length > 0) {
                        await m.reply(`¡Claro! Aquí tienes el método de pago para ${paisEncontrado}:` + metodoPago);
                    } else {
                        const noMethodMessage = `Lo siento, aún no tenemos un método de pago configurado para ${paisEncontrado}. Un moderador se pondrá en contacto contigo lo antes posible para ayudarte.`;
                        await m.reply(noMethodMessage);
                        const ownerNotificationMessage = `El usuario ${m.pushName} (+${m.sender ? m.sender.split('@')[0] : 'N/A'}) ha preguntado por un método de pago en ${paisEncontrado}, pero no está configurado.`;
                        await notificarOwnerHandler(m, { conn, text: ownerNotificationMessage, command: 'notificarowner', usedPrefix: m.prefix });
                    }
                    return;
                }

                const paymentInfoKeywords = ['día de pago', 'dia de pago', 'fecha de pago', 'cuando pago', 'cuando me toca pagar', 'monto', 'cuanto debo', 'cuanto pagar', 'pais', 'país'];
                const isPaymentInfoIntent = paymentInfoKeywords.some(keyword => messageTextLower.includes(keyword));

                if (isPaymentInfoIntent) {
                    const paymentsData = loadPaymentsData();
                    const formattedSender = normalizarNumero(`+${m.sender.split('@')[0]}`);
                    const clientInfo = paymentsData[formattedSender];

                    if (clientInfo) {
                        let replyText = `¡Hola, ${clientInfo.nombre}! Aquí está la información que tengo sobre tu cuenta:\n\n`;

                        if (clientInfo.diaPago) {
                            replyText += `🗓️ *Tu día de pago es el día ${clientInfo.diaPago} de cada mes.*\n`;
                        }

                        if (clientInfo.monto) {
                            replyText += `💰 *El monto que te toca pagar es de ${clientInfo.monto}.*\n`;
                        }

                        if (clientInfo.bandera) {
                            replyText += `🌍 *El país que tengo registrado para ti es ${clientInfo.bandera}.*\n`;
                        }

                        if (clientInfo.pagos && clientInfo.pagos.length > 0) {
                            const ultimoPago = clientInfo.pagos[clientInfo.pagos.length - 1];
                            if (ultimoPago.fecha) {
                                replyText += `✅ *Tu último pago fue el ${ultimoPago.fecha}.*\n`;
                            }
                        }

                        await m.reply(replyText);
                        return;
                    } else {
                        await m.reply('Lo siento, no he encontrado información de cliente asociada a tu número. Por favor, asegúrate de que tu cuenta esté registrada.');
                        return;
                    }
                }

                const paymentProofKeywords = ['realizar un pago', 'quiero pagar', 'comprobante', 'pagar', 'pago'];
                const isPaymentProofIntent = paymentProofKeywords.some(keyword => messageTextLower.includes(keyword));

                if (isPaymentProofIntent) {
                    const paymentMessage = `✅ Si ya ha realizado su pago, por favor envía la foto o documento de su pago con el siguiente texto:\n\n"Aquí está mi comprobante de pago" 📸`;
                    await m.reply(paymentMessage);
                    return;
                }

                const ownerKeywords = ['creador', 'dueño', 'owner', 'administrador', 'admin', 'soporte', 'contactar', 'leonet'];
                const isOwnerContactIntent = ownerKeywords.some(keyword => messageTextLower.includes(keyword));

                if (isOwnerContactIntent) {
                    await notificarOwnerHandler(m, { conn });
                    return;
                }

                try {
                    const paymentsData = loadPaymentsData();
                    const formattedSender = normalizarNumero(`+${m.sender.split('@')[0]}`);
                    const clientInfoPrompt = !!paymentsData[formattedSender] ?
                        `El usuario es un cliente existente con los siguientes detalles: Nombre: ${paymentsData[formattedSender].nombre}, Día de pago: ${paymentsData[formattedSender].diaPago}, Monto: ${paymentsData[formattedSender].monto}, Bandera: ${paymentsData[formattedSender].bandera}. Su estado es ${paymentsData[formattedSender].suspendido ? 'suspendido' : 'activo'}.` :
                        `El usuario no es un cliente existente. Es un cliente potencial.`;
                    const historicalChatPrompt = Object.keys(userChatData).length > 0 ?
                        `Datos previos de la conversación con este usuario: ${JSON.stringify(userChatData)}.` :
                        `No hay datos previos de conversación con este usuario.`;

                    const paymentMethods = {
                        'méxico': `\n\nPara pagar en México, usa:\n722969020694617538\nMercado Pago Wallet\nSarai Ortega Góngora\nConcepto: préstamo/escuela\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
                        'perú': `\n\nPara pagar en Perú, usa:\nNombre: Nicole A.\nYape: 904521589\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
                        'mexico': `\n\nPara pagar en México, usa:\n722969020694617538\nMercado Pago Wallet\nSarai Ortega Góngora\nConcepto: préstamo/escuela\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
                        'peru': `\n\nPara pagar en Perú, usa:\nNombre: Nicole A.\nYape: 904521589\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
                        'chile': `\n\nPara pagar en Chile, usa:\nNombre: BARINIA VALESKA ZENTENO MERINO\nRUT: 17053067-5\nBANCO ELEGIR: TEMPO\nTipo de cuenta: Cuenta Vista\nNumero de cuenta: 111117053067\nCorreo: estraxer2002@gmail.com\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
                        'argentina': `\n\nPara pagar en Argentina, usa:\nNombre: Milagros Flores\nCBU: 4530000800016108966889\nALIAS: miluu.912\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
                        'bolivia': ``,
                        'españa': ``,
                        'brasil': ``,
                        'paypal': ``,
                        'estados unidos': ``,
                        'puerto rico': ``,
                        'uruguay': `\n\nPara pagar en Uruguay, usa:\n1691414\nGaston Juarez\nPREX\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
                        'paraguay': `\n\nPara pagar en paraguay, usa:\nMaría Isabel Cogorno Rojas\nC.I N.  4.627.087\nTelefono 0984-854-037\nUeno Bank. 619345391\n\nSi quieres realizar el pago dime algo como "Ahora realizo el pago"`,
                        'colombia': ``
                    };

                    const personaPrompt = `Eres MiluAI, un asistente virtual profesional para la atención al cliente de Milu. Tu objetivo es ayudar a los clientes con consultas sobre pagos y servicios. No uses frases como "Estoy aquí para ayudarte", "Como tu asistente...", "Como un asistente virtual" o similares. Ve directo al punto y sé conciso.

                    El nombre del usuario es ${userChatData.nombre || 'el usuario'} y el historial de chat con datos previos es: ${JSON.stringify(userChatData)}.

                    Instrucciones:
                    - Responde de forma concisa, útil y profesional.
                    - Si te preguntan por métodos de pago, proporciona la siguiente información: ${JSON.stringify(paymentMethods)}.
                    - No proporciones información personal ni financiera sensible.
                    - No inventes precios. Si te preguntan por el precio de un servicio, informa que revisen la lista de servicios.
                    - Eres capaz de identificar a los clientes. Aquí hay información del usuario:

                    ${clientInfoPrompt}

                    Has aprendido que tus servicios son:
                    - 📧Spam: 3 Días: 1200 (ARS/CLP) / 5.00 PEN / 15 BOB / 10200 PYG ; 7 Días: 2200 (ARS/CLP) / 8.50 PEN / 27 BOB / 18700 PYG ; 13 Días: 3000 (ARS/CLP) / 11.30 PEN / 37 BOB / 25500 PYG ; 16 Días: 3700 (ARS/CLP) / 14.20 PEN / 45 BOB / 31450 PYG ; 20 Días: 4500 (ARS/CLP) / 17.20 PEN / 55 BOB / 38250 PYG ; 27 Días: 5200 (ARS/CLP) / 20.00 PEN / 63 BOB / 44500 PYG ; 32 Días: 6000 (ARS/CLP) / 22.00 PEN / 73 BOB / 51000 PYG ; 37 Días: 6700 (ARS/CLP) / 26.00 PEN / 81 BOB / 56950 PYG
                    - 📦Combos: Combo 1 (Mega Renovación): 17780 ARS / 17880 CLP / 65 PEN / 215 BOB / 855 UYU / 152200 PYG ; Combo 2 (Renovación): 9900 ARS / 10,000 CLP / 37 PEN / 117 BOB / 465 UYU / 81300 PYG ; Combo 3 (Mini Renovación): 6930 ARS / 7000 CLP / 27 PEN / 84 BOB / 335 UYU / 59000 PYG
                    - 🤖Bot de etiquetas mensual: 1 Grupo: 1200 (ARS/CLP) / 5.00 PEN ; 2 Grupos: 2100 (ARS/CLP) / 8.00 PEN ; 3 Grupos: 3100 (ARS/CLP) / 11.80 PEN ; 4 Grupos: 4100 (ARS/CLP) / 15.80 PEN
                    - 🤖Bot de etiquetas permanente: 1 Grupo: 2200 (ARS/CLP) / 5.50 PEN ; 2 Grupos: 3300 (ARS/CLP) / 13.00 PEN ; 3 Grupos: 4200 (ARS/CLP) / 16.00 PEN ; 4 Grupos: 5500 (ARS/CLP) / 21.00 PEN`;

                    const encodedContent = encodeURIComponent(personaPrompt);
                    const encodedText = encodeURIComponent(m.text);
                    const url = `https://apis-starlights-team.koyeb.app/starlight/turbo-ai?content=${encodedContent}&text=${encodedText}`;

                    const apiii = await fetch(url);
                    if (!apiii.ok) {
                        m.reply('Lo siento, no pude procesar tu solicitud. Intenta de nuevo más tarde.');
                        return;
                    }
                    const json = await apiii.json();

                    if (json.content) {
                        m.reply(json.content);
                    } else {
                        m.reply('Lo siento, no pude procesar tu solicitud. Intenta de nuevo más tarde.');
                    }
                } catch (e) {
                    console.error(`[❗] Error al llamar a la API de IA: ${e.message}`);
                    m.reply('Lo siento, no pude procesar tu solicitud. Ocurrió un error con el servicio de IA.');
                }
            }
        }
    } catch (e) {
        console.error(`[ERROR GENERAL] en el handler principal: ${e.message}`);
        m.reply('Lo siento, ha ocurrido un error al procesar tu solicitud.');
    }
}

let file = fileURLToPath(import.meta.url);
watchFile(file, () => {
    unwatchFile(file);
    import(`${file}?update=${Date.now()}`);
});
