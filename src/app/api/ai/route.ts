import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { handle, requireUser, HttpError } from '@/lib/http';
import { env } from '@/lib/env';
export const maxDuration = 60;

const PROMPTS: Record<string, string> = {
  brief: 'Sos el asistente de una Business Manager. Con la lista dada, escribí su resumen de inicio del día en español rioplatense: hasta 5 líneas breves, empezando por lo vencido y lo que espera su respuesta, y cerrando con la reunión más importante. Sin saludos ni relleno. No inventes datos.',
  followup: 'Escribí un mensaje breve y cordial de seguimiento, en español rioplatense y con voseo, para recordarle a una persona un compromiso atrasado. Sin reproches, con una pregunta concreta y ofreciendo ayuda. Máximo 4 líneas. Devolvé solo el texto del mensaje.',
  reply: 'Escribí un borrador de respuesta breve, en español rioplatense y con voseo, para el último mensaje de la conversación dada. Respondé lo que se pide; si falta un dato, dejalo entre corchetes para que la persona lo complete. Devolvé solo el texto del mensaje.',
};

// Textos generados con Claude. Nunca se envían solos: la persona los revisa, copia y envía.
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    if (!env.anthropicKey()) throw new HttpError(400, 'Para usar Claude, cargá ANTHROPIC_API_KEY en Vercel.');
    const { mode, context } = await req.json();
    if (!PROMPTS[mode]) throw new HttpError(400, 'Modo desconocido.');
    const client = new Anthropic({ apiKey: env.anthropicKey() });
    const msg = await client.messages.create({ model: env.anthropicModel(), max_tokens: 600, system: PROMPTS[mode], messages: [{ role: 'user', content: String(context).slice(0, 12000) }] });
    return NextResponse.json({ text: msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim() });
  });
}
