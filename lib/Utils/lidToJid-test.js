"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lidToJid = lidToJid;
/**
 * Convert a WhatsApp LID (or raw number) into a full JID string.
 *
 * @param lid - Bisa berupa:
 *   • string seperti "6281234567890"
 *   • number (akan di-cast ke string)
 *   • sudah berformat JID (mis. "6281234567890@s.whatsapp.net")
 *
 * @returns string JID yang valid (mis. "6281234567890@s.whatsapp.net")
 */
function lidToJid(lid) {
    if (!lid)
        throw new Error("lidToJid: parameter 'lid' wajib diisi");
    let id = String(lid).trim();
    // Jika sudah berakhiran @s.whatsapp.net atau @g.us, langsung kembalikan
    if (/@(s\.whatsapp\.net|g\.us)$/.test(id)) {
        return id;
    }
    // Buang karakter non-digit (jaga-jaga jika ada spasi/tanda plus)
    id = id.replace(/[^\d]/g, "");
    if (!id.length)
        throw new Error("lidToJid: format LID tidak valid");
    return `${id}@s.whatsapp.net`;
}
