import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json');
const chatDataPath = path.join(__dirname, '..', 'src', 'chat_data.json');

const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    return {
        services: {},
        chatGreeting: "¡Hola! He recibido tu consulta. Soy LeoNet AI. Para darte la mejor ayuda, ¿podrías darme tu nombre y el motivo de tu consulta? A partir de ahora puedes hacerme cualquier pregunta."
    };
};

const loadChatData = () => {
    if (fs.existsSync(chatDataPath)) {
        return JSON.parse(fs.readFileSync(chatDataPath, 'utf8'));
    }
    return {};
};

const saveChatData = (data) => {
    fs.writeFileSync(chatDataPath, JSON.stringify(data, null, 2), 'utf8');
};

export async function handler(m, { conn, text }) {
    if (!m.isGroup) {
        const currentConfigData = loadConfigBot();
        const chatData = loadChatData();

        if (!chatData[m.sender]) {
            chatData[m.sender] = {};
        }

        const services = currentConfigData.services || {};
        const serviceIdToFind = text.trim();
        let serviceFound = null;

        // Iterar sobre las categorías para encontrar el servicio
        for (const category in services) {
            const serviceList = services[category];
            const found = serviceList.find(service => service.id === serviceIdToFind);
            if (found) {
                serviceFound = found;
                break;
            }
        }

        if (serviceFound) {
            let replyText = `*${serviceFound.pregunta}*\n\n${serviceFound.descripcion}`;

            if (serviceFound.precio) {
                replyText += `\n\n*💰 Precio:* ${serviceFound.precio}`;
            }
            if (serviceFound.stock !== undefined) {
                replyText += `\n📦 *Stock:* ${serviceFound.stock}`;
            }

            replyText += '\n\nSi estás interesado en adquirir este producto, dime el país donde te encuentras para brindarte el método de pago.';

            chatData[m.sender].lastSelectedServiceId = serviceIdToFind;
            saveChatData(chatData);

            await m.reply(replyText);
            console.log(chalk.green(`[✅] Servicio encontrado y enviado para el ID: "${serviceIdToFind}"`));
            return true;
        } else {
            await m.reply('❌ Lo siento, no se encontró información para el servicio que seleccionaste. Por favor, inténtalo de nuevo desde el menú principal.');
            console.log(chalk.red(`[❌] No se encontró un servicio con el ID: "${serviceIdToFind}".`));
            return false;
        }
    } else {
        await m.reply('❌ Lo siento, esta función solo está disponible en chats privados.');
        return true;
    }
}
