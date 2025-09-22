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
export declare function lidToJid(lid: string | number): string;
