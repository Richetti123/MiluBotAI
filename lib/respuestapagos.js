import { generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { smsg } from './simple.js';
import { format } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

// Define __filename y __dirname para entornos de módulo ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta a los archivos de configuración
const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');
const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json');
const chatDataPath = path.join(__dirname, '..', 'src', 'chat_data.json');
const processedButtonIds = new Set(); // Para evitar procesar el mismo botón dos veces

const loadPayments = () => {
    if (fs.existsSync(paymentsFilePath)) {
        return JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
    }
    return {};
};

const savePayments = (data) => {
    fs.writeFileSync(paymentsFilePath, JSON.stringify(data, null, 2), 'utf8');
};

const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    return { services: {} };
};

const saveConfigBot = (config) => {
    fs.writeFileSync(configBotPath, JSON.stringify(config, null, 2), 'utf8');
};

const loadChatData = () => {
    if (fs.existsSync(chatDataPath)) {
        return JSON.parse(fs.readFileSync(chatDataPath, 'utf8'));
    }
    return {};
};

const saveChatData = (data) => {
    fs.writeFileSync(chatDataPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(chalk.yellow('[DEBUG] Archivo chat_data.json guardado.'));
};

/**
 * Descuenta 1 unidad del stock de un servicio específico.
 * @param {string} serviceId El ID del servicio.
 * @returns {boolean} True si se descontó el stock, false si no se encontró el servicio o el stock es 0.
 */
const updateStock = (serviceId) => {
    console.log(chalk.magenta(`[DEBUG] Intentando descontar stock para el servicio: ${serviceId}`));
    const configData = loadConfigBot();
    let serviceFound = false;
    for (const category in configData.services) {
        for (const service of configData.services[category]) {
            if (service.id === serviceId) {
                if (service.stock !== undefined && service.stock > 0) {
                    service.stock--;
                    serviceFound = true;
                    console.log(chalk.green(`[DEBUG] Stock descontado. Nuevo stock para ${serviceId}: ${service.stock}`));
                } else {
                    console.log(chalk.red(`[DEBUG] No se pudo descontar el stock para ${serviceId}. Stock actual: ${service.stock}`));
                }
                break;
            }
        }
        if (serviceFound) break;
    }
    if (serviceFound) {
        saveConfigBot(configData);
        return true;
    }
    return false;
};

/**
 * Maneja la respuesta del propietario a los botones de comprobante de pago.
 * @param {import('@whiskeysockets/baileys').WAMessage} m
 * @param {import('@whiskeysockets/baileys').WASocket} conn
 * @returns {boolean} True si la respuesta fue manejada, false en caso contrario.
 */
export async function handlePaymentProofButton(m, conn) {
    if (m.isOwner && m.text) {
        const selectedId = m.text;
        console.log(chalk.cyan(`[DEBUG] Botón de comprobante presionado por el dueño. ID: ${selectedId}`));

        // Verificamos si el botón ya ha sido procesado
        if (processedButtonIds.has(selectedId)) {
            console.log(chalk.red(`[DEBUG] Botón ${selectedId} ya ha sido procesado. Ignorando.`));
            return true;
        }

        // Lógica para aceptar o rechazar el comprobante
        if (selectedId.startsWith('accept_payment_') || selectedId.startsWith('reject_payment_')) {
            // Agregamos el ID a la lista de procesados
            processedButtonIds.add(selectedId);

            try {
                const clientJid = selectedId.replace('accept_payment_', '').replace('reject_payment_', '');
                const formattedNumberForAdmin = `+${clientJid.split('@')[0]}`;

                if (selectedId.startsWith('accept_payment_')) {
                    const responseMessage = '✅ ¡Genial! Tu pago ha sido aceptado. En un momento el creador se comunicará contigo para la entrega del servicio que compraste.';
                    await conn.sendMessage(clientJid, { text: responseMessage });
                    console.log(chalk.green(`[DEBUG] Mensaje de aceptación enviado a ${formattedNumberForAdmin}.`));

                    const paymentsData = loadPayments();
                    const clientPhoneNumberKey = formattedNumberForAdmin;
                    if (paymentsData[clientPhoneNumberKey]) {
                        paymentsData[clientPhoneNumberKey].comprobantesPendientes = false;
                        savePayments(paymentsData);
                        console.log(chalk.green(`[DEBUG] Estatus de comprobantes pendientes actualizado para ${formattedNumberForAdmin}.`));
                    }

                    // Nueva lógica: preguntar al dueño si fue una venta para descontar stock
                    const chatData = loadChatData();
                    const lastSelectedService = chatData[formattedNumberForAdmin]?.lastSelectedServiceId;
                    console.log(chalk.magenta(`[DEBUG] lastSelectedServiceId recuperado para ${formattedNumberForAdmin}: ${lastSelectedService}`));

                    if (lastSelectedService) {
                        const buttons = [
                            { buttonId: `confirm_sale_${clientJid}_${lastSelectedService}`, buttonText: { displayText: '✅ Sí fue una venta' }, type: 1 },
                            { buttonId: `no_sale_${clientJid}`, buttonText: { displayText: '❌ No fue una venta' }, type: 1 }
                        ];
                        const buttonMessage = {
                            text: `✅ Comprobante aceptado. Se notificó al cliente ${formattedNumberForAdmin}. \n\n¿Fue una venta de *${lastSelectedService}*?`,
                            buttons: buttons,
                            headerType: 1
                        };
                        await conn.sendMessage(m.chat, buttonMessage);
                        console.log(chalk.green(`[DEBUG] Botón de confirmación de venta enviado para el servicio: ${lastSelectedService}`));
                    } else {
                        await m.reply(`✅ Comprobante aceptado. Se notificó al cliente ${formattedNumberForAdmin}. No se pudo descontar stock, ya que no se encontró el último servicio seleccionado.`);
                        console.log(chalk.red(`[DEBUG] No se encontró el lastSelectedServiceId para ${formattedNumberForAdmin}. No se pudo enviar el botón de confirmación.`));
                    }

                } else if (selectedId.startsWith('reject_payment_')) {
                    const responseMessage = '❌Mi creador ha rechazado este comprobante de pago, tal vez porque es falso o porque la transferencia no se recibió. De igual manera, en un momento se comunicará contigo para resolver este problema.';
                    await conn.sendMessage(clientJid, { text: responseMessage });

                    await m.reply(`❌ Comprobante rechazado. Se notificó al cliente ${formattedNumberForAdmin}.`);
                    console.log(chalk.red(`[DEBUG] Comprobante rechazado para ${formattedNumberForAdmin}.`));
                }
                return true;
            } catch (e) {
                console.error('Error al manejar el botón de comprobante:', e);
                await m.reply('Ocurrió un error al procesar la solicitud.');
                processedButtonIds.delete(selectedId);
                return false;
            }
        }
        // Lógica para confirmar la venta y descontar stock
        else if (selectedId.startsWith('confirm_sale_')) {
            try {
                const [, , clientJid, serviceId] = selectedId.split('_');
                console.log(chalk.cyan(`[DEBUG] Botón de confirmación de venta presionado. Extrayendo serviceId: ${serviceId}`));
                const formattedNumberForAdmin = `+${clientJid.split('@')[0]}`;

                if (updateStock(serviceId)) {
                    await m.reply(`✅ Se ha descontado 1 unidad de stock para el servicio *${serviceId}*.`);
                    console.log(chalk.green(`[DEBUG] Stock descontado con éxito para ${serviceId}.`));
                } else {
                    await m.reply(`⚠️ No se pudo descontar el stock para el servicio *${serviceId}*. Puede que el servicio no exista o el stock ya esté en 0.`);
                    console.log(chalk.red(`[DEBUG] Fallo al descontar stock para ${serviceId}.`));
                }
                processedButtonIds.add(selectedId);
                return true;
            } catch (e) {
                console.error('Error al confirmar venta:', e);
                await m.reply('Ocurrió un error al procesar la confirmación de la venta.');
                processedButtonIds.delete(selectedId);
                return false;
            }
        }
        // Lógica para no descontar stock
        else if (selectedId.startsWith('no_sale_')) {
            const [, , clientJid] = selectedId.split('_');
            const formattedNumberForAdmin = `+${clientJid.split('@')[0]}`;
            await m.reply(`✅ Ok, no se descontó el stock. `);
            processedButtonIds.add(selectedId);
            return true;
        }
    }
    return false;
}

export async function manejarRespuestaPago(m, conn) {
    const sender = m.sender || m.key?.participant || m.key?.remoteJid;
    if (!sender) return false;

    let userDoc = await new Promise((resolve, reject) => {
        global.db.data.users.findOne({ id: sender }, (err, doc) => {
            if (err) return reject(err);
            resolve(doc);
        });
    });

    if (!userDoc) {
        return false;
    }

    let respuesta = '';
    if (m.message?.buttonsResponseMessage) {
        respuesta = m.message.buttonsResponseMessage.selectedButtonId || m.message.buttonsResponseMessage.selectedDisplayText || '';
    } else if (m.message?.templateButtonReplyMessage) {
        respuesta = m.message.templateButtonReplyMessage.selectedId || m.message.templateButtonReplyMessage.selectedDisplayText || '';
    } else if (m.message?.listResponseMessage) {
        respuesta = m.message.listResponseMessage.singleSelectReply?.selectedRowId || m.message.listResponseMessage.title || '';
    } else {
        respuesta = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
    }

    // Aquí se guarda el ID del servicio en chat_data.json cuando se selecciona un servicio
    if (respuesta.startsWith('!getfaq')) {
        const serviceId = respuesta.replace('!getfaq ', '').trim();
        console.log(chalk.green(`[DEBUG] El usuario ha seleccionado un servicio. ID: ${serviceId}.`));
        const chatData = loadChatData();
        const formattedSender = sender.split('@')[0];
        
        if (!chatData[formattedSender]) {
            chatData[formattedSender] = {};
        }
        chatData[formattedSender].lastSelectedServiceId = serviceId;
        saveChatData(chatData);
        console.log(chalk.green(`[DEBUG] El serviceId ${serviceId} se ha guardado en chat_data.json para el usuario ${formattedSender}.`));
    }
    
    respuesta = respuesta.trim();

    if (respuesta === "2" || respuesta.toLowerCase() === "necesito ayuda") {
        await conn.sendMessage(m.chat || sender, {
            text: `⚠️ En un momento se comunicará mi creador contigo.`
        });
        const adminJid = "5217731161701@s.whatsapp.net";
        const pagosPath = path.join(__dirname, '..', 'src', 'pagos.json');
        let pagosData = {};
        if (fs.existsSync(pagosPath)) {
            pagosData = JSON.parse(fs.readFileSync(pagosPath, 'utf8'));
        }
        const cliente = pagosData[userDoc.paymentClientNumber] || {};
        const nombre = cliente.nombre || userDoc.paymentClientName || "cliente";
        const numero = cliente.numero || userDoc.paymentClientNumber || sender.split('@')[0];
        const adminMessage = `👋 Hola creador, *${nombre}* (+${numero}) tiene problemas con su pago. Por favor comunícate con él/ella.`;
        try {
            await conn.sendMessage(adminJid, { text: adminMessage });
        } catch (error) {
            console.error('Error enviando mensaje al admin:', error);
        }

        await new Promise((resolve, reject) => {
            global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'active' } }, {}, (err) => {
                if (err) {
                    console.error("Error al actualizar chatState a 'active':", err);
                    return reject(err);
                }
                resolve();
            });
        });
        return true;
    }

    if (userDoc.chatState === 'awaitingPaymentResponse' && !m.key.fromMe) {
        if (respuesta === "1" || respuesta.toLowerCase() === "he realizado el pago") {
            const chatId = m.chat || sender;

            await conn.sendMessage(chatId, {
                text: `✅ *Si ya ha realizado su pago, por favor envía la foto o documento de su pago con el siguiente texto:*\n\n*"Aquí está mi comprobante de pago"* 📸`
            });
            console.log(chalk.green(`[DEBUG] Se solicitó un comprobante de pago al usuario ${sender}.`));

            await new Promise((resolve, reject) => {
                global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'awaitingPaymentProof' } }, {}, (err) => {
                    if (err) {
                        console.error("Error al actualizar chatState a 'awaitingPaymentProof':", err);
                        return reject(err);
                    }
                    console.log(chalk.green(`[DEBUG] chatState actualizado a 'awaitingPaymentProof' para ${m.sender}.`));
                    resolve();
                });
            });
            return true;
        } else if (/^\d+$/.test(respuesta) && respuesta !== "1") {
            await conn.sendMessage(m.chat || sender, {
                text: 'Por favor responde solo con 1 (He realizado el pago) o 2 (Necesito ayuda con mi pago).'
            });
            return true;
        }
        return false;
    }

    return false;
}
