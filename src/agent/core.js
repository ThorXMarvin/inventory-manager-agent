/**
 * Core Agent Orchestrator — v2 with Function Calling
 * 
 * Replaces the v1 parser-based approach with proper LLM function calling.
 * Supports OpenAI, Anthropic, and Google (Gemini) providers.
 * 
 * Flow:
 * 1. Receive user message
 * 2. Send to LLM with system prompt + tool definitions
 * 3. If LLM returns tool_calls, execute each via executor
 * 4. Send tool results back to LLM
 * 5. Repeat until LLM returns final text response
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { toOpenAITools, toAnthropicTools } from './tools.js';
import { executeToolCalls } from './executor.js';
import { buildSystemPrompt } from './prompts.js';
import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

let llmClient = null;

/**
 * Initialize the LLM client based on config.
 */
function initClient() {
  const { llm } = getConfig();

  switch (llm.provider) {
    case 'openai':
      llmClient = { type: 'openai', client: new OpenAI({ apiKey: llm.apiKey }) };
      break;

    case 'anthropic':
      llmClient = { type: 'anthropic', client: new Anthropic({ apiKey: llm.apiKey }) };
      break;

    case 'ollama':
      llmClient = {
        type: 'openai',
        client: new OpenAI({ apiKey: 'ollama', baseURL: `${llm.ollamaBaseUrl}/v1` }),
      };
      break;

    case 'google':
      llmClient = {
        type: 'openai',
        client: new OpenAI({
          apiKey: llm.apiKey,
          baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        }),
      };
      break;

    default:
      logger.warn(`Unknown LLM provider: ${llm.provider}. Falling back to openai.`);
      llmClient = { type: 'openai', client: new OpenAI({ apiKey: llm.apiKey }) };
  }

  logger.info(`LLM initialized: ${llm.provider} / ${llm.model} (function calling mode)`);
}

/**
 * Process a user message using the function calling loop.
 * @param {string} message - Raw user message
 * @param {Object} meta - Optional metadata (sender, channel, etc.)
 * @returns {Promise<string>} Response text
 */
export async function processMessage(message, meta = {}) {
  if (!llmClient) initClient();

  const { llm } = getConfig();
  const systemPrompt = buildSystemPrompt();

  try {
    if (llmClient.type === 'anthropic') {
      return await processAnthropic(message, systemPrompt, llm.model);
    } else {
      return await processOpenAI(message, systemPrompt, llm.model);
    }
  } catch (err) {
    logger.error(`Error processing message: ${err.message}`, err);
    return `❌ Sorry, something went wrong. Please try again.\nError: ${err.message}`;
  }
}

/**
 * OpenAI-compatible function calling loop (works for OpenAI, Ollama, Google Gemini).
 */
async function processOpenAI(message, systemPrompt, model) {
  const tools = toOpenAITools();
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message },
  ];

  const MAX_ITERATIONS = 10;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await llmClient.client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 2048,
      temperature: 0.3,
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    // If no tool calls, we have the final response
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return assistantMessage.content || 'I processed your request.';
    }

    // Add assistant message (with tool calls) to history
    messages.push(assistantMessage);

    // Parse and execute tool calls
    const toolCalls = assistantMessage.tool_calls.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}'),
    }));

    logger.info(`Tool calls: ${toolCalls.map(tc => tc.name).join(', ')}`);
    const results = await executeToolCalls(toolCalls);

    // Add tool results to message history
    for (const result of results) {
      messages.push({
        role: 'tool',
        tool_call_id: result.tool_call_id,
        content: JSON.stringify(result.result),
      });
    }
  }

  return '⚠️ Reached maximum processing steps. Please try a simpler request.';
}

/**
 * Anthropic function calling loop.
 */
async function processAnthropic(message, systemPrompt, model) {
  const tools = toAnthropicTools();
  const messages = [{ role: 'user', content: message }];

  const MAX_ITERATIONS = 10;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await llmClient.client.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages,
    });

    // Check if there are tool use blocks
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const textBlocks = response.content.filter(b => b.type === 'text');

    // If no tool calls and we have text, return the text
    if (toolUseBlocks.length === 0) {
      return textBlocks.map(b => b.text).join('\n') || 'I processed your request.';
    }

    // If stop_reason is 'end_turn' and we have text + no more tool calls needed
    if (response.stop_reason === 'end_turn' && textBlocks.length > 0 && toolUseBlocks.length === 0) {
      return textBlocks.map(b => b.text).join('\n');
    }

    // Add assistant response to messages
    messages.push({ role: 'assistant', content: response.content });

    // Execute tool calls
    const toolCalls = toolUseBlocks.map(block => ({
      id: block.id,
      name: block.name,
      arguments: block.input || {},
    }));

    logger.info(`Tool calls: ${toolCalls.map(tc => tc.name).join(', ')}`);
    const results = await executeToolCalls(toolCalls);

    // Add tool results
    const toolResults = results.map(r => ({
      type: 'tool_result',
      tool_use_id: r.tool_call_id,
      content: JSON.stringify(r.result),
    }));

    messages.push({ role: 'user', content: toolResults });
  }

  return '⚠️ Reached maximum processing steps. Please try a simpler request.';
}

export default { processMessage };
