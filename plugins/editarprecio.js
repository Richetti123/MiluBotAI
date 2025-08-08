import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json');

const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    console.error('⚠️ configbot.json no encontrado en:', configBotPath);
    return { services: {} };
};

const saveConfigBot = (configData) => {
    try {
        fs.writeFileSync(configBotPath, JSON.stringify(configData, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('❌ Error al guardar configbot.json:', error);
        return false;
    }
};

let handler = async (m, { conn, command, usedPrefix, text, isOwner }) => {
    if (!isOwner) {
        return m.reply(`❌ Solo el propietario puede usar este comando.`);
    }

    if (!text) {
        return m.reply(`📦 Uso correcto: *${usedPrefix}${command} <nombre_del_servicio> <nuevo_precio>*\n\nEjemplo: ${usedPrefix}${command} Netflix Extra 70`);
    }

    const args = text.split(' ');
    const newPrice = args.pop(); // El último argumento es el precio
    const serviceName = args.join(' ').trim(); // El resto es el nombre del servicio

    if (!serviceName || !newPrice) {
        return m.reply('❌ Formato de comando incorrecto. Por favor, usa: `.editarprecio <nombre_del_servicio> <precio>`');
    }

    try {
        const configData = loadConfigBot();
        let serviceFound = false;
        let formattedPrice = newPrice;

        // Verificar si el precio ya contiene 'MX' o '$'
        if (!newPrice.toUpperCase().includes('MX') && !newPrice.includes('$')) {
            formattedPrice = `${newPrice} MX`;
        }

        for (const category in configData.services) {
            for (const service of configData.services[category]) {
                if (service.pregunta.toLowerCase() === serviceName.toLowerCase()) {
                    service.precio = formattedPrice;
                    serviceFound = true;
                    break;
                }
            }
            if (serviceFound) break;
        }

        if (serviceFound) {
            if (saveConfigBot(configData)) {
                m.reply(`✅ Precio del servicio *${serviceName}* actualizado a *${formattedPrice}*.`);
            } else {
                m.reply('Ocurrió un error al intentar guardar los cambios.');
            }
        } else {
            m.reply(`⚠️ Servicio con nombre *${serviceName}* no encontrado en la configuración.`);
        }

    } catch (error) {
        console.error('Error al editar el precio:', error);
        m.reply('Ocurrió un error al intentar editar el precio.');
    }
};

handler.help = ['editarprecio <nombre> <precio>'];
handler.tags = ['owner'];
handler.command = /^(editarprecio)$/i;

export { handler };
