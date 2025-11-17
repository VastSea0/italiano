import { GoogleGenAI } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { word } = await request.json()
    if (!word) {
      return NextResponse.json({ error: 'Word is required' }, { status: 400 })
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    })

    const config = {
      thinkingConfig: {
        thinkingBudget: -1,
      },
    }

    const model = 'gemini-flash-latest'

    const prompt = `Translate the Italian word "${word}" to English and provide the complete vocabulary entry in JSON format for a language learning app. Determine if it's a verb or noun. If it's a verb, return JSON with: infinitive, english, present (array of conjugations), past (array), presentContinuous (array), examples (array). If it's a noun, return JSON with: italian, english, forms (array), gender, plural, type, examples (array). Normalize articles if present. Return only the JSON object.`

    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ]

    const response = await ai.models.generateContentStream({
      model,
      config,
      contents,
    })

    let fullText = ''
    for await (const chunk of response) {
      fullText += chunk.text
    }

    // Parse the JSON response
    const parsed = JSON.parse(fullText.trim())

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Translation error:', error)
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 })
  }
}