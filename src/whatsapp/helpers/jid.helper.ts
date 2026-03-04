export class JidHelper {
  /**
   * Converte qualquer string (número puro, jid de grupo, broadcast)
   * no formato oficial do WhatsApp XMPP (Jabber ID).
   */
  static formatJid(target: string): string {
    if (!target) return '';

    // Remove espaços, +, e formatadores
    const clean = target.replace(/[^0-9a-zA-Z@.:-]/g, '');

    // Se já tiver @, o usuário passou completo. Precisamos apenas normalizar
    if (clean.includes('@')) {
      // Baileys oficial mudou @c.us (API de terceiros antiga) para @s.whatsapp.net (Natividade Meta XMPP)
      if (clean.endsWith('@c.us')) {
        return clean.replace('@c.us', '@s.whatsapp.net');
      }
      return clean; // Pode ser @g.us ou @broadcast
    }

    // Se possui hífen, é forte indício de ser ID antigo de Grupo (antigo formato: creator-timestamp)
    // Padrões novos de grupo costumam ter 18 digitos numéricos
    if (clean.includes('-')) {
      return `${clean}@g.us`;
    }

    // Se for só número (Pessoa Física normal)
    return `${clean}@s.whatsapp.net`;
  }
}
