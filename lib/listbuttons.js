import fs from 'fs';
import path from 'path';

const configBotPath = path.join(process.cwd(), 'src', 'configbot.json');

const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    return { faqs: {} };
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

    const faqKey = selectedRowId.replace(prefix, '').trim();
    const currentConfig = loadConfigBot();
    const faq = currentConfig.faqs[faqKey];

    // ✅ CORRECCIÓN: Validamos si la FAQ existe. Si no, devolvemos un error.
    if (faq) {
        const responseText = `*${faq.pregunta}*\n\n${faq.respuesta}\n\n*Precio:* ${faq.precio}`;
        await conn.sendMessage(m.chat, { text: responseText }, { quoted: m });
        
        if (global.db && global.db.data && global.db.data.users) {
            try {
                let userDoc = await new Promise((resolve, reject) => {
                    global.db.data.users.findOne({ id: m.sender }, (err, doc) => {
                        if (err) return reject(err);
                        resolve(doc);
                    });
                });

                if (userDoc) {
                    userDoc.lastFaqSentKey = faqKey;
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
        // En caso de que no se encuentre la FAQ, enviamos un mensaje de error claro
        await m.reply('❌ Lo siento, no se encontró el servicio solicitado. Por favor, selecciona una opción válida de la lista.');
        return true;
    }
}
