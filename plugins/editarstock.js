import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Define __filename y __dirname para entornos de módulo ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta al archivo configbot.json (ajusta según la estructura real de tu proyecto)
// Por ejemplo, si está en la misma carpeta que 'src', la ruta sería 'path.join(__dirname, 'configbot.json');'
// Si está en 'src' como en tu ejemplo de ayuda, mantenemos la ruta original.
const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json'); 

// Función para cargar la configuración del bot
const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    console.error('⚠️ configbot.json no encontrado en:', configBotPath);
    return { services: {} }; // Retorna un objeto básico si no existe, para evitar errores
};

// Función para guardar la configuración del bot
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
    // Asegúrate de que solo el propietario pueda usar este comando
    if (!isOwner) {
        return m.reply(`❌ Solo el propietario puede usar este comando.`);
    }

    if (!text) {
        return m.reply(`📦 Uso correcto: *${usedPrefix}${command} <id_del_servicio> <nueva_cantidad_stock>*\n\nEjemplo: ${usedPrefix}${command} netflix_extra 5`);
    }

    const args = text.split(' ');
    const serviceId = args[0];
    const newStock = parseInt(args[1]);

    if (isNaN(newStock) || newStock < 0) {
        return m.reply('❌ La cantidad de stock debe ser un número entero válido y no negativo.');
    }

    try {
        const configData = loadConfigBot(); // Cargar la configuración actual

        let serviceFound = false;
        // Iterar sobre las categorías de servicios para encontrar el ID
        for (const category in configData.services) {
            for (const service of configData.services[category]) {
                if (service.id === serviceId) {
                    service.stock = newStock; // Actualizar el stock
                    serviceFound = true;
                    break;
                }
            }
            if (serviceFound) break; // Si ya lo encontramos, salimos del bucle exterior
        }

        if (serviceFound) {
            // Guardar los cambios en el archivo configbot.json
            if (saveConfigBot(configData)) {
                m.reply(`✅ Stock del servicio *${serviceId}* actualizado a *${newStock}*.`);
            } else {
                m.reply('An error occurred while trying to save the stock changes.');
            }
        } else {
            m.reply(`⚠️ Servicio con ID *${serviceId}* no encontrado en la configuración.`);
        }

    } catch (error) {
        console.error('Error al editar el stock:', error);
        m.reply('An error occurred while trying to edit the stock.');
    }
};

// Configuración de ayuda y comandos para el handler
handler.help = ['editarstock <id> <cantidad>'];
handler.tags = ['owner']; // O la categoría que consideres adecuada para comandos de propietario
handler.command = /^(editarstock)$/i;

export { handler };
