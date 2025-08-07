import { generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { smsg } from './simple.js';
import { format } from 'util';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk'; // Importar chalk para logs coloreados

// Ruta al archivo de pagos
const paymentsFilePath = path.join(process.cwd(), 'src', 'pagos.json');
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

/**
 * Maneja la respuesta del propietario a los botones de comprobante de pago.
 * @param {import('@whiskeysockets/baileys').WAMessage} m
 * @param {import('@whiskeysockets/baileys').WASocket} conn
 * @returns {boolean} True si la respuesta fue manejada, false en caso contrario.
 */
export async function handlePaymentProofButton(m, conn) {
    console.log(chalk.bgBlue.white(`[DEBUG RESPUESTAPAGOS] Entrando a handlePaymentProofButton. m.isOwner: ${m.isOwner}, m.text: ${m.text}`));

    if (m.isOwner && m.text) {
        const selectedId = m.text;

        // Verificamos si el botón ya ha sido procesado
        if (processedButtonIds.has(selectedId)) {
            console.log(chalk.yellow(`[DEBUG RESPUESTAPAGOS] Botón con ID ${selectedId} ya procesado. Ignorando.`));
            return true; // Ya se procesó, no hacer nada más
        }

        if (selectedId.startsWith('accept_payment_') || selectedId.startsWith('reject_payment_')) {
            console.log(chalk.bgMagenta.white(`[DEBUG RESPUESTAPAGOS] ID de botón de pago detectado: ${selectedId}`));
            // Agregamos el ID a la lista de procesados ANTES de intentar procesar
            processedButtonIds.add(selectedId);

            try {
                const clientJid = selectedId.replace('accept_payment_', '').replace('reject_payment_', '');
                console.log(chalk.magenta(`[DEBUG RESPUESTAPAGOS] JID del cliente extraído: ${clientJid}`));

                const formattedNumberForAdmin = `+${clientJid.split('@')[0]}`;
                console.log(chalk.magenta(`[DEBUG RESPUESTAPAGOS] Número del cliente formateado para admin: ${formattedNumberForAdmin}`));

                if (selectedId.startsWith('accept_payment_')) {
                    const responseMessage = '✅ ¡Genial! Tu pago ha sido aceptado. En un momento el creador se comunicará contigo para la entrega del servicio que compraste.';
                    console.log(chalk.green(`[DEBUG RESPUESTAPAGOS] Enviando mensaje de aceptación a ${clientJid}.`));
                    await conn.sendMessage(clientJid, { text: responseMessage });

                    const paymentsData = loadPayments();
                    const clientPhoneNumberKey = formattedNumberForAdmin;
                    if (paymentsData[clientPhoneNumberKey]) {
                        paymentsData[clientPhoneNumberKey].comprobantesPendientes = false;
                        savePayments(paymentsData);
                        console.log(chalk.green(`[DEBUG RESPUESTAPAGOS] comprobantesPendientes actualizado a false para ${clientPhoneNumberKey}.`));
                    }

                    console.log(chalk.green(`[DEBUG RESPUESTAPAGOS] Notificando al propietario que el comprobante fue aceptado para ${formattedNumberForAdmin}.`));
                    await m.reply(`✅ Comprobante aceptado. Se notificó al cliente ${formattedNumberForAdmin}.`);
                } else if (selectedId.startsWith('reject_payment_')) {
                    const responseMessage = '❌Mi creador ha rechazado este comprobante de pago, tal vez porque es falso o porque la transferencia no se recibió. De igual manera, en un momento se comunicará contigo para resolver este problema.';
                    console.log(chalk.red(`[DEBUG RESPUESTAPAGOS] Enviando mensaje de rechazo a ${clientJid}.`));
                    await conn.sendMessage(clientJid, { text: responseMessage });

                    console.log(chalk.red(`[DEBUG RESPUESTAPAGOS] Notificando al propietario que el comprobante fue rechazado para ${formattedNumberForAdmin}.`));
                    await m.reply(`❌ Comprobante rechazado. Se notificó al cliente ${formattedNumberForAdmin}.`);
                }
                return true; // Indica que el botón fue manejado con éxito
            } catch (e) {
                console.error(chalk.red(`[ERROR RESPUESTAPAGOS] Error al manejar el botón de comprobante ${selectedId}: ${e.message}`));
                await m.reply('Ocurrió un error al procesar la solicitud.');
                processedButtonIds.delete(selectedId); // Si hay un error, removemos el ID para poder reintentar
                return false; // Indica que hubo un error y no se pudo manejar
            }
        }
    }
    console.log(chalk.blue(`[DEBUG RESPUESTAPAGOS] handlePaymentProofButton no manejó el mensaje. Retornando false.`));
    return false; // No se manejó el botón aquí
}

export async function manejarRespuestaPago(m, conn) {
    console.log(chalk.bgBlue.white(`[DEBUG RESPUESTAPAGOS] Entrando a manejarRespuestaPago. Sender: ${m.sender}`));

    const sender = m.sender || m.key?.participant || m.key?.remoteJid;
    if (!sender) {
        console.log(chalk.red(`[DEBUG RESPUESTAPAGOS] No se pudo obtener el sender. Retornando false.`));
        return false;
    }

    let userDoc = await new Promise((resolve, reject) => {
        global.db.data.users.findOne({ id: sender }, (err, doc) => {
            if (err) {
                console.error(chalk.red(`[ERROR RESPUESTAPAGOS] Error al buscar userDoc para ${sender}: ${err}`));
                return reject(err);
            }
            resolve(doc);
        });
    });

    if (!userDoc) {
        console.log(chalk.yellow(`[DEBUG RESPUESTAPAGOS] No se encontró userDoc para ${sender}. Retornando false.`));
        return false;
    }

    let respuesta = '';
    if (m.message?.buttonsResponseMessage) {
        respuesta = m.message.buttonsResponseMessage.selectedButtonId || m.message.buttonsResponseMessage.selectedDisplayText || '';
        console.log(chalk.blue(`[DEBUG RESPUESTAPAGOS] Respuesta de botón (buttonsResponseMessage): ${respuesta}`));
    } else if (m.message?.templateButtonReplyMessage) {
        respuesta = m.message.templateButtonReplyMessage.selectedId || m.message.templateButtonReplyMessage.selectedDisplayText || '';
        console.log(chalk.blue(`[DEBUG RESPUESTAPAGOS] Respuesta de botón (templateButtonReplyMessage): ${respuesta}`));
    } else if (m.message?.listResponseMessage) {
        respuesta = m.message.listResponseMessage.singleSelectReply?.selectedRowId || m.message.listResponseMessage.title || '';
        console.log(chalk.blue(`[DEBUG RESPUESTAPAGOS] Respuesta de botón (listResponseMessage): ${respuesta}`));
    } else {
        respuesta = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        console.log(chalk.blue(`[DEBUG RESPUESTAPAGOS] Respuesta de conversación/texto: ${respuesta}`));
    }

    respuesta = respuesta.trim();

    if (respuesta === "2" || respuesta.toLowerCase() === "necesito ayuda") {
        console.log(chalk.magenta(`[DEBUG RESPUESTAPAGOS] Respuesta 'Necesito ayuda' o '2' detectada de ${sender}.`));
        await conn.sendMessage(m.chat || sender, {
            text: `⚠️ En un momento se comunicará mi creador contigo.`
        });
        const adminJid = "5217731161701@s.whatsapp.net";
        const pagosPath = path.join(process.cwd(), 'src', 'pagos.json');
        let pagosData = {};
        if (fs.existsSync(pagosPath)) {
            pagosData = JSON.parse(fs.readFileSync(pagosPath, 'utf8'));
        }
        const cliente = pagosData[userDoc.paymentClientNumber] || {};
        const nombre = cliente.nombre || userDoc.paymentClientName || "cliente";
        const numero = cliente.numero || userDoc.paymentClientNumber || sender.split('@')[0];
        const adminMessage = `👋 Hola creador, *${nombre}* (+${numero}) tiene problemas con su pago. Por favor comunícate con él/ella.`;
        try {
            console.log(chalk.green(`[DEBUG RESPUESTAPAGOS] Enviando mensaje al admin ${adminJid}.`));
            await conn.sendMessage(adminJid, { text: adminMessage });
        } catch (error) {
            console.error(chalk.red('[ERROR RESPUESTAPAGOS] Error enviando mensaje al admin:', error));
        }

        await new Promise((resolve, reject) => {
            global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'active' } }, {}, (err) => {
                if (err) {
                    console.error(chalk.red("Error al actualizar chatState a 'active' (necesito ayuda):", err));
                    return reject(err);
                }
                console.log(chalk.green(`[DEBUG RESPUESTAPAGOS] chatState actualizado a 'active' para ${m.sender}.`));
                resolve();
            });
        });
        return true;
    }

    // Se unifica el manejo de la respuesta "1" para evitar duplicaciones
    if (userDoc.chatState === 'awaitingPaymentResponse' && !m.key.fromMe) {
        if (respuesta === "1" || respuesta.toLowerCase() === "he realizado el pago") {
            console.log(chalk.magenta(`[DEBUG RESPUESTAPAGOS] Respuesta 'He realizado el pago' o '1' detectada de ${sender} en estado 'awaitingPaymentResponse'.`));
            const chatId = m.chat || sender;

            await conn.sendMessage(chatId, {
                text: `✅ *Si ya ha realizado su pago, por favor envía la foto o documento de su pago con el siguiente texto:*\n\n*"Aquí está mi comprobante de pago"* 📸`
            });

            // Se actualiza el estado del chat a 'awaitingPaymentProof' para que la próxima
            // imagen o documento sea manejado correctamente por el handler.
            await new Promise((resolve, reject) => {
                global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'awaitingPaymentProof' } }, {}, (err) => {
                    if (err) {
                        console.error(chalk.red("Error al actualizar chatState a 'awaitingPaymentProof':", err));
                        return reject(err);
                    }
                    console.log(chalk.green(`[DEBUG RESPUESTAPAGOS] chatState actualizado a 'awaitingPaymentProof' para ${m.sender}.`));
                    resolve();
                });
            });
            return true;
        } else if (/^\d+$/.test(respuesta) && respuesta !== "1") {
            console.log(chalk.yellow(`[DEBUG RESPUESTAPAGOS] Respuesta numérica inválida '${respuesta}' de ${sender} en estado 'awaitingPaymentResponse'.`));
            await conn.sendMessage(m.chat || sender, {
                text: 'Por favor responde solo con 1 (He realizado el pago) o 2 (Necesito ayuda con mi pago).'
            });
            return true;
        }
        console.log(chalk.blue(`[DEBUG RESPUESTAPAGOS] manejarRespuestaPago no manejó el mensaje con el chatState 'awaitingPaymentResponse'. Retornando false.`));
        return false;
    }

    console.log(chalk.blue(`[DEBUG RESPUESTAPAGOS] manejarRespuestaPago no manejó el mensaje. Retornando false.`));
    return false;
}
