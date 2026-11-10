import crypto from 'node:crypto';

const MAX_OUTPUT_TOKENS = 64000;

function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {} };
  }
  const clone = structuredClone(schema);
  delete clone.$schema;
  if (!clone.type) clone.type = 'object';
  if (clone.type === 'object' && !clone.properties) clone.properties = {};
  return clone;
}

function systemText(system) {
  if (!system) return '';
  if (typeof system === 'string') return system.trim();
  if (!Array.isArray(system)) return '';
  return system
    .map((block) => {
      if (typeof block === 'string') return block;
      if (block?.type === 'text' && typeof block.text === 'string') return block.text;
      return '';
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function imageUrl(source) {
  if (!source) return null;
  if (source.type === 'base64' && source.data) {
    return `data:${source.media_type || 'image/png'};base64,${source.data}`;
  }
  if (source.type === 'url' && source.url) return source.url;
  return null;
}

function toolResultText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content == null ? '' : JSON.stringify(content);
  const parts = [];
  for (const block of content) {
    if (typeof block === 'string') parts.push(block);
    else if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    else if (block?.type === 'image') parts.push('[image omitted]');
    else parts.push(JSON.stringify(block));
  }
  return parts.join('\n');
}

function mapToolChoice(choice) {
  if (!choice || choice === 'auto' || choice.type === 'auto') return 'auto';
  if (choice === 'any' || choice.type === 'any') return 'required';
  if (choice === 'none' || choice.type === 'none') return 'none';
  if (choice.type === 'tool' && choice.name) return { type: 'function', name: choice.name };
  return 'auto';
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

export function toResponsesRequest(request, { mode = 'stable' } = {}) {
  const model = request?.model;
  if (!model) throw new Error('The request has no model.');

  const tools = Array.isArray(request.tools)
    ? request.tools
        .filter((tool) => tool && typeof tool.name === 'string')
        .map((tool) => ({
          type: 'function',
          name: tool.name,
          description: tool.description || undefined,
          parameters: normalizeSchema(tool.input_schema),
          strict: false,
        }))
    : [];

  const input = [];
  let pendingMessage = null;

  const flush = () => {
    if (pendingMessage) {
      input.push(pendingMessage);
      pendingMessage = null;
    }
  };

  const addText = (role, text) => {
    if (!text) return;
    if (!pendingMessage) {
      pendingMessage = {
        type: 'message',
        role,
        content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text }],
      };
    } else {
      pendingMessage.content.push({
        type: role === 'assistant' ? 'output_text' : 'input_text',
        text,
      });
    }
  };

  const addImage = (role, url) => {
    if (!url) return;
    if (!pendingMessage) {
      pendingMessage = { type: 'message', role, content: [{ type: 'input_image', image_url: url }] };
    } else {
      pendingMessage.content.push({ type: 'input_image', image_url: url });
    }
  };

  for (const message of request.messages || []) {
    const role = message?.role === 'assistant' ? 'assistant' : 'user';
    const blocks =
      typeof message?.content === 'string'
        ? [{ type: 'text', text: message.content }]
        : Array.isArray(message?.content)
          ? message.content
          : [];

    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue;

      if (block.type === 'text' && typeof block.text === 'string') {
        addText(role, block.text);
        continue;
      }

      if (block.type === 'image' && role === 'user') {
        addImage(role, imageUrl(block.source));
        continue;
      }

      if (block.type === 'tool_use') {
        flush();
        input.push({
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        });
        continue;
      }

      if (block.type === 'tool_result') {
        flush();
        input.push({
          type: 'function_call_output',
          call_id: block.tool_use_id,
          output: toolResultText(block.content),
        });
        continue;
      }

      // thinking / redacted_thinking / server_tool_use have no Responses equivalent here.
    }
  }
  flush();

  if (input.length === 0) {
    input.push({ type: 'message', role: 'user', content: [{ type: 'input_text', text: '' }] });
  }

  const body = {
    model,
    input,
    store: false,
    stream: Boolean(request.stream),
    max_output_tokens: clamp(request.max_tokens || 8192, 1, MAX_OUTPUT_TOKENS),
  };

  const instructions = systemText(request.system);
  if (instructions) body.instructions = instructions;

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = mapToolChoice(request.tool_choice);
  }

  if (mode === 'stable') {
    body.reasoning = { effort: tools.length > 0 ? 'low' : 'none' };
  } else {
    const budget = Number(request.thinking?.budget_tokens || 0);
    body.reasoning = { effort: budget >= 12000 ? 'high' : 'medium' };
  }

  if (request.metadata?.user_id) {
    body.metadata = { user_id: String(request.metadata.user_id) };
  }

  return body;
}

export function estimateTokens(payload) {
  const text = JSON.stringify({
    system: payload?.system,
    messages: payload?.messages,
    tools: payload?.tools,
  });
  return Math.max(1, Math.ceil((text || '').length / 4));
}

function parseArguments(raw) {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function appendText(content, text) {
  if (!text) return;
  const last = content[content.length - 1];
  if (last && last.type === 'text') last.text += text;
  else content.push({ type: 'text', text });
}

export function fromResponsesJson(payload, { model } = {}) {
  const content = [];
  let hasToolCall = false;

  for (const item of payload?.output || []) {
    if (item?.type === 'message') {
      for (const part of item.content || []) {
        if (part?.type === 'output_text' && typeof part.text === 'string') {
          appendText(content, part.text);
        }
      }
      continue;
    }

    if (item?.type === 'function_call') {
      hasToolCall = true;
      content.push({
        type: 'tool_use',
        id: item.call_id || item.id || `toolu_${crypto.randomBytes(8).toString('hex')}`,
        name: item.name,
        input: parseArguments(item.arguments),
      });
    }
  }

  if (content.length === 0) content.push({ type: 'text', text: '' });

  const incomplete = payload?.status === 'incomplete';
  const usage = payload?.usage || {};
  return {
    id: `msg_${crypto.randomBytes(12).toString('hex')}`,
    type: 'message',
    role: 'assistant',
    model: model || payload?.model || '',
    content,
    stop_reason: hasToolCall ? 'tool_use' : incomplete ? 'max_tokens' : 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: Number(usage.input_tokens) || 0,
      output_tokens: Number(usage.output_tokens) || 0,
    },
  };
}

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export class ResponsesStreamTranslator {
  constructor({ res, model, onDone = null }) {
    this.res = res;
    this.model = model;
    this.onDone = onDone;
    this.messageId = `msg_${crypto.randomBytes(12).toString('hex')}`;
    this.started = false;
    this.finished = false;
    this.nextIndex = 0;
    this.blocksOpened = 0;
    this.active = null;
    this.toolSeen = false;
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.textSent = false;
    this.argsSent = false;
  }

  write(event, data) {
    if (this.res.writableEnded) return;
    this.res.write(sse(event, data));
  }

  begin() {
    if (this.started) return;
    this.started = true;
    this.write('message_start', {
      type: 'message_start',
      message: {
        id: this.messageId,
        type: 'message',
        role: 'assistant',
        model: this.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    });
  }

  openBlock(kind, payload) {
    this.closeActive();
    const index = this.nextIndex;
    this.nextIndex += 1;
    this.blocksOpened += 1;
    this.write('content_block_start', {
      type: 'content_block_start',
      index,
      content_block: payload,
    });
    this.active = { kind, index, itemId: payload.id || null };
    return this.active;
  }

  openText() {
    this.textSent = false;
    return this.openBlock('text', { type: 'text', text: '' });
  }

  openTool(item) {
    this.toolSeen = true;
    this.argsSent = false;
    return this.openBlock('tool', {
      type: 'tool_use',
      id: item.call_id || item.id || `toolu_${crypto.randomBytes(8).toString('hex')}`,
      name: item.name || 'unknown',
      input: {},
    });
  }

  closeActive() {
    if (!this.active) return;
    this.write('content_block_stop', {
      type: 'content_block_stop',
      index: this.active.index,
    });
    this.active = null;
  }

  text(text) {
    if (!text) return;
    if (!this.active || this.active.kind !== 'text') this.openText();
    this.write('content_block_delta', {
      type: 'content_block_delta',
      index: this.active.index,
      delta: { type: 'text_delta', text },
    });
    this.textSent = true;
  }

  toolArguments(itemId, partial) {
    if (!partial) return;
    if (!this.active || this.active.kind !== 'tool') {
      this.openTool({ call_id: itemId, name: 'unknown' });
    }
    this.write('content_block_delta', {
      type: 'content_block_delta',
      index: this.active.index,
      delta: { type: 'input_json_delta', partial_json: partial },
    });
    this.argsSent = true;
  }

  handle(event) {
    if (!event || this.finished) return;
    const type = event.type;
    if (!type) return;

    if (type === 'response.created') {
      this.begin();
      return;
    }

    if (type === 'response.output_item.added') {
      const item = event.item;
      if (!item) return;
      if (item.type === 'message') this.openText();
      else if (item.type === 'function_call') this.openTool(item);
      return;
    }

    if (type === 'response.output_text.delta') {
      this.text(event.delta);
      return;
    }

    if (type === 'response.output_text.done') {
      if (!this.textSent && typeof event.text === 'string') this.text(event.text);
      return;
    }

    if (type === 'response.function_call_arguments.delta') {
      this.toolArguments(event.item_id, event.delta);
      return;
    }

    if (type === 'response.function_call_arguments.done') {
      if (this.active?.kind === 'tool') {
        if (!this.argsSent && typeof event.arguments === 'string') {
          this.toolArguments(event.item_id, event.arguments);
        }
        this.closeActive();
      }
      return;
    }

    if (type === 'response.output_item.done') {
      const item = event.item;
      if (!item) return;
      if (item.type === 'function_call') {
        if (!this.active || this.active.kind !== 'tool' || this.active.itemId !== (item.call_id || item.id)) {
          this.openTool(item);
        }
        if (!this.argsSent && typeof item.arguments === 'string') {
          this.toolArguments(item.call_id || item.id, item.arguments);
        }
        this.closeActive();
      } else if (item.type === 'message') {
        if (this.active?.kind === 'text') this.closeActive();
      }
      return;
    }

    if (type === 'response.completed' || type === 'response.incomplete') {
      this.finish(event.response, type === 'response.incomplete' ? 'max_tokens' : null);
      return;
    }

    if (type === 'response.failed') {
      this.fail(event.response?.error?.message || 'AgentRouter reported a failed response.');
      return;
    }

    if (type === 'error') {
      this.fail(event.error?.message || event.message || 'AgentRouter stream error.');
    }
  }

  finish(response, forcedStop = null) {
    if (this.finished) return;
    const usage = response?.usage || {};
    this.inputTokens = Number(usage.input_tokens) || this.inputTokens;
    this.outputTokens = Number(usage.output_tokens) || this.outputTokens;

    if (this.blocksOpened === 0) {
      this.openText();
    }
    this.closeActive();

    const incomplete =
      forcedStop === 'max_tokens' ||
      response?.status === 'incomplete' ||
      response?.incomplete_details?.reason === 'max_output_tokens';
    const stopReason = this.toolSeen ? 'tool_use' : incomplete ? 'max_tokens' : 'end_turn';

    this.write('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: this.outputTokens },
    });
    this.write('message_stop', { type: 'message_stop' });
    this.finished = true;
    if (this.onDone) {
      this.onDone({
        inputTokens: this.inputTokens,
        outputTokens: this.outputTokens,
        stopReason,
        toolCalls: this.toolSeen ? 1 : 0,
      });
    }
  }

  fail(message) {
    if (this.finished) return;
    this.closeActive();
    this.write('error', {
      type: 'error',
      error: { type: 'api_error', message: String(message) },
    });
    this.finished = true;
    if (this.onDone) {
      this.onDone({
        inputTokens: this.inputTokens,
        outputTokens: this.outputTokens,
        stopReason: 'error',
        toolCalls: this.toolSeen ? 1 : 0,
        error: String(message),
      });
    }
  }

  endIfNeeded() {
    if (!this.finished) this.finish(null);
  }

  ping() {
    if (!this.finished) this.write('ping', { type: 'ping' });
  }
}
