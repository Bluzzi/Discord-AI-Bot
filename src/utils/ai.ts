import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "#/utils/env";

const provider = createOpenAICompatible({ 
  name: 'mistral',
  apiKey: env.MISTRAL_API_KEY, 
  baseURL: env.MISTRAL_BASE_URL,
  fetch: async (url, init) => {
    const response = await fetch(url, init);
    
    if (response.ok && url.toString().includes('/chat/completions')) {
      const clonedResponse = response.clone();
      try {
        const data: any = await clonedResponse.json();
        
        if (data.choices && Array.isArray(data.choices)) {
          data.choices = data.choices.map((choice: any) => {
            if (choice.finish_reason === null) {
              if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
                choice.finish_reason = 'tool_calls';
              } else if (choice.message?.content) {
                choice.finish_reason = 'stop';
              }
            }
            return choice;
          });
        }
        
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (e) {
        return response;
      }
    }
    
    return response;
  },
});

export const aiModel = provider(env.MISTRAL_MODEL!);
