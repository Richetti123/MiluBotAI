import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_NUMBER_CONFIRMATION = '5492213165900@s.whatsapp.net';
const DELAY_BETWEEN_MESSAGES_MS = 1800000; // 30 minutos

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Lógica de envío automático
export async function sendAutomaticPaymentRemindersLogic(client) {
    const today = new Date();
    const currentDayOfMonth = today.getDate();

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowDayOfMonth = tomorrow.getDate();

    try {
        const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');
        let clientsData = {};
        if (fs.existsSync(paymentsFilePath)) {
            clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
        } else {
            fs.writeFileSync(paymentsFilePath, JSON.stringify({}, null, 2), 'utf8');
        }

        const clientsToSendReminders = [];

        for (const phoneNumberKey in clientsData) {
            const clientInfo = clientsData[phoneNumberKey];
            const numero = phoneNumberKey;
            const { diaPago, bandera, nombre, suspendido, pagoRealizado } = clientInfo;

            // --- Lógica actualizada para omitir si el pago ya se realizó ---
            if (suspendido || pagoRealizado) {
                console.log(`[Recordatorios] Omitiendo a ${nombre} (${numero}) porque su cuenta está suspendida o el pago ya fue registrado.`);
                continue;
            }
            // --- Fin de la lógica actualizada ---

            const monto = clientInfo.pagos && clientInfo.pagos.length > 0 ? clientInfo.pagos[0].monto : 'un monto no especificado';

            if (!numero) continue;

            let mainReminderMessage = '';
            let paymentDetails = '';
            let shouldSend = false;

            if (diaPago === currentDayOfMonth) {
                mainReminderMessage = `¡Hola ${nombre}! 👋 Es tu día de pago. Recuerda que tu monto es de ${monto}.`;
                shouldSend = true;
            } else if (diaPago === tomorrowDayOfMonth) {
                mainReminderMessage = `¡Hola ${nombre}! 👋 Tu pago de ${monto} vence mañana. ¡No lo olvides!`;
                shouldSend = true;
            }

            if (shouldSend) {
                switch (bandera) {
                    case '🇲🇽':
                        paymentDetails = `\n\nPara pagar en México, usa:
CLABE: 706969168872764411
Nombre: Gaston Juarez
Banco: Arcus Fi`;
                        break;
                    case '🇵🇪':
                        paymentDetails = `\n\nPara pagar en Perú, usa:
Nombre: Marcelo Gonzales R.
Yape: 967699188
Plin: 955095498`;
                        break;
                    case '🇨🇱':
                        paymentDetails = `\n\nPara pagar en Chile, usa:
Nombre: BARINIA VALESKA ZENTENO MERINO
RUT: 17053067-5
BANCO ELEGIR: TEMPO
Tipo de cuenta: Cuenta Vista
Numero de cuenta: 111117053067
Correo: estraxer2002@gmail.com`;
                        break;
                    case '🇦🇷':
                        paymentDetails = `\n\nPara pagar en Argentina, usa:
Nombre: Gaston Juarez
CBU: 4530000800011127480736`;
                        break;
                    case '🇺🇸':
                        paymentDetails = `\n\nPara pagar en Estados Unidos, usa:
Nombre: Marcelo Gonzales R.
Correo: jairg6218@gmail.com
Enlace: https://paypal.me/richetti123`;
                        break;
                    default:
                        paymentDetails = `\n\nPara pagar desde cualquier parte del mundo, usa paypal:
Nombre: Marcelo Gonzales R.
Correo: jairg6218@gmail.com
Enlace: https://paypal.me/richetti123`;
                }

                const formattedNumber = numero.replace(/\+/g, '') + '@s.whatsapp.net';

                const buttons = [
                    { buttonId: '1', buttonText: { displayText: 'He realizado el pago' }, type: 1 },
                    { buttonId: '2', buttonText: { displayText: 'Necesito ayuda con mi pago' }, type: 1 }
                ];

                const buttonMessage = {
                    text: mainReminderMessage + paymentDetails + '\n\n*Escoge una de las opciones:*',
                    buttons: buttons,
                    headerType: 1
                };

                clientsToSendReminders.push({ formattedNumber, buttonMessage, nombre, numero });
            }
        }

        for (let i = 0; i < clientsToSendReminders.length; i++) {
            const { formattedNumber, buttonMessage, nombre, numero } = clientsToSendReminders[i];

            try {
                await client.sendMessage(formattedNumber, buttonMessage);

                let userDoc = await new Promise((resolve, reject) => {
                    global.db.data.users.findOne({ id: formattedNumber }, (err, doc) => {
                        if (err) return reject(err);
                        resolve(doc);
                    });
                });

                if (userDoc) {
                    userDoc.chatState = 'awaitingPaymentResponse';
                    userDoc.paymentClientName = nombre;
                    userDoc.paymentClientNumber = numero;
                    await new Promise((resolve, reject) => {
                        global.db.data.users.update({ id: formattedNumber }, { $set: userDoc }, {}, (err) => {
                            if (err) return reject(err);
                            resolve();
                        });
                    });
                } else {
                    userDoc = {
                        id: formattedNumber,
                        chatState: 'awaitingPaymentResponse',
                        paymentClientName: nombre,
                        paymentClientNumber: numero
                    };
                    await new Promise((resolve, reject) => {
                        global.db.data.users.insert(userDoc, (err, newDoc) => {
                            if (err) return reject(err);
                            resolve(newDoc);
                        });
                    });
                }

                await client.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `✅ Recordatorio automático enviado a *${nombre}* (${numero}).` });

            } catch (sendError) {
                try {
                    await client.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `❌ Falló el recordatorio automático a *${nombre}* (${numero}). Error: ${sendError.message || sendError}` });
                } catch (adminSendError) {}
            }

            if (i < clientsToSendReminders.length - 1) {
                await sleep(DELAY_BETWEEN_MESSAGES_MS);
            }
        }
    } catch (error) {
        console.error('Error general en sendAutomaticPaymentRemindersLogic:', error);
    }
}
