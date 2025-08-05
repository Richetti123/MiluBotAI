import fs from 'fs';
import path from 'path';

const configBotPath = path.join(process.cwd(), 'src', 'configbot.json');

const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    return { services: {} }; // Usa 'services' en lugar de 'faqs'
};

export async function handleListButtonResponse(m, conn) {
    const selectedRowId = m.message?.listResponseMessage?.singleSelectReply?.selectedRowId;
    if (!selectedRowId) {
        return false;
    }

    const prefix = '!getfaq';
    if (!selectedRowId.startsWith(prefix)) {
        return false;
    }

    const faqId = selectedRowId.replace(prefix, '').trim();
    const currentConfig = loadConfigBot();
    let foundFaq = null;

    // ✅ CORRECCIÓN: Buscamos en todas las categorías de servicios
    for (const category in currentConfig.services) {
        const services = currentConfig.services[category];
        foundFaq = services.find(service => service.id === faqId);
        if (foundFaq) {
            break;
        }
    }

    if (foundFaq) {
        const responseText = `*${foundFaq.pregunta}*\n\n${foundFaq.descripcion}\n\n*Precio:* ${foundFaq.precio}`;
        await conn.sendMessage(m.chat, { text: responseText }, { quoted: m });
        
        // Manejo de la base de datos (mantenido igual)
        if (global.db && global.db.data && global.db.data.users) {
            try {
                let userDoc = await new Promise((resolve, reject) => {
                    global.db.data.users.findOne({ id: m.sender }, (err, doc) => {
                        if (err) return resolve(null);
                        resolve(doc);
                    });
                });

                if (userDoc) {
                    userDoc.lastFaqSentKey = faqId;
                    await new Promise((resolve, reject) => {
                        global.db.data.users.update({ id: m.sender }, { $set: userDoc }, {}, (err) => {
                            if (err) return reject(err);
                            resolve();
                        });
                    });
                }
            } catch (e) {
                console.error('Error al actualizar la base de datos para el usuario:', e);
            }
        }
        
        return true;
    } else {
        await m.reply('❌ Lo siento, no se encontró el servicio solicitado. Por favor, selecciona una opción válida de la lista.');
        return true;
    }
}
