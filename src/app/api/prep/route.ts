import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { handle, requireUser, HttpError } from '@/lib/http';
import { env } from '@/lib/env';
export const maxDuration = 60;
// Resumen de preparación de una reunión, generado con Claude a partir del contexto que arma la app.
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    if (!env.anthropicKey()) throw new HttpError(400, 'Para generar el resumen con Claude, cargá ANTHROPIC_API_KEY en Vercel.');
    const { context } = await req.json();
    const client = new Anthropic({ apiKey: env.anthropicKey() });
    const msg = await client.messages.create({
      model: env.anthropicModel(), max_tokens: 700,
      system: 'Preparás a una Business Manager para una reunión. Con el contexto dado, escribí en español rioplatense: 1) en dos frases, de qué viene el tema; 2) hasta 4 puntos para tratar, empezando por lo vencido o lo que espera respuesta; 3) qué debería pedir o confirmar. Sé breve. No inventes datos que no estén en el contexto.',
      messages: [{ role: 'user', content: String(context).slice(0, 12000) }],
    });
    return NextResponse.json({ text: msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim() });
  });
}
