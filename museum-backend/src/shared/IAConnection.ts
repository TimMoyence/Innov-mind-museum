import { HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { ChatAnthropic } from '@langchain/anthropic';
import { Ollama } from '@langchain/community/llms/ollama';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
// import { ChatMistralAI } from '@langchain/mistralai';
import { ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';
dotenv.config();

export class IAConnection {
  chatOpenAI(modelName: string, temperatureNumber: number) {
    return new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      model: modelName,
      temperature: temperatureNumber,
    });
  }

  chatDeepseekAI(modelName: string) {
    return new ChatOpenAI({
      configuration: {
        baseURL: 'https://api.deepseek.com/v1',
      },
      openAIApiKey: process.env.DEEPSEEK_API_KEY,
      model: modelName,
    });
  }

  // ? not work yet
  chatOllamaAI(modelName: string) {
    return new Ollama({
      baseUrl: 'http://localhost:11434/api/generate', // Default value
      model: modelName, // Default value
    });
  }

  // chatMistral(modelName: string) {
  //   return new ChatMistralAI({
  //     apiKey: process.env.MISTRAL_API_KEY,
  //     model: modelName,
  //   });
  // }

  chatGoogleGenerativeAI(modelName: string, maxTokens: number) {
    return new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY,
      model: modelName,
      maxOutputTokens: maxTokens,
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
        },
      ],
    });
  }

  chatAntropicClaudeAI(modelName: string) {
    return new ChatAnthropic({
      temperature: 0.9,
      model: modelName,
      maxTokens: 1024,
    });
  }
}
