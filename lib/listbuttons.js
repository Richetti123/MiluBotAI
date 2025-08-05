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

    if (faq) {
        const responseText = `*${faq.pregunta}*\n\n${faq.respuesta}\n\n*Precio:* ${faq.precio}`;
        await conn.sendMessage(m.chat, { text: responseText }, { quoted: m });
        
        // ✅ CORRECCIÓN: Manejo más seguro de la base de datos
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
                // No respondemos al usuario, simplemente registramos el error.
            }
        }
        
        return true;
    }
    
    return false;
}
