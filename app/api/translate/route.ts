import { GoogleGenAI } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      apiVersion: 'v1',
    })

    const models = await ai.models.list()
    return NextResponse.json(models)
  } catch (error) {
    console.error('List models error:', error)
    return NextResponse.json({ error: 'Failed to list models' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { word } = await request.json()
    if (!word) {
      return NextResponse.json({ error: 'Word is required' }, { status: 400 })
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      apiVersion: 'v1',
    })

    const model = 'gemini-2.0-flash'

    const prompt = `Translate the Italian word "${word}" to English and provide the complete vocabulary entry in JSON format for a language learning app. Determine if it's a verb, noun, adjective, adverb, pronoun, preposition, conjunction, or time expression. Return JSON with: category (one of: verbs, commonNouns, adjectives, adverbs, pronouns, prepositions, conjunctions, timeExpressions), and then the appropriate fields. For verbs: infinitive, english, present (array), past (array), presentContinuous (array), examples (array). For other categories: italian, english, forms (array), gender, plural, type, examples (array). Normalize articles if present.`

    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: 'You are an AI that always responds with valid JSON objects only. No explanations, no extra text.',
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ]

    const response = await ai.models.generateContent({
      model,
      contents,
    })

    console.log('Full response:', JSON.stringify(response, null, 2))

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || ''
    console.log('AI response text:', text)

    let cleanText = text.trim()
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/```json\n?/, '').replace(/\n?```/, '').trim()
    }

    try {
      // Try to parse as JSON
      const parsed = JSON.parse(cleanText)
      return NextResponse.json(parsed)
    } catch {
      // If not JSON, return as text
      return NextResponse.json({ text: cleanText })
    }
  } catch (error) {
    console.error('Translation error:', error)
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 })
  }
}