export class JidHelper {
  static formatJid(target: string): string {
    if (!target) return '';

    const clean = target.replace(/[^0-9a-zA-Z@.:-]/g, '');

    if (clean.includes('@')) {
      if (clean.endsWith('@c.us')) {
        return clean.replace('@c.us', '@s.whatsapp.net');
      }
      return clean;
    }
    if (clean.includes('-')) {
      return `${clean}@g.us`;
    }

    return `${clean}@s.whatsapp.net`;
  }
}
