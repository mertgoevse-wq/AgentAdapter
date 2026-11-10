import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toResponsesRequest,
  fromResponsesJson,
  estimateTokens,
  ResponsesStreamTranslator,
} from '../src/translate.js';

test('system blocks are joined into instructions', () => {
  const request = toResponsesRequest({
    model: 'gpt-5.6-sol',
    system: [
      { type: 'text', text: 'You are precise.' },
      { type: 'text', text: 'Never invent files.' },
    ],
    messages: [{ role: 'user', content: 'Hello' }],
  });
  assert.equal(request.instructions, 'You are precise.\n\nNever invent files.');
});

test('tools, tool_choice and tool_result map to Responses items', () => {
  const request = toResponsesRequest({
    model: 'gpt-5.6-sol',
    max_tokens: 2000,
    messages: [
      { role: 'user', content: 'Read package.json' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will read it.' },
          { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'package.json' } },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"name":"x"}' }],
      },
    ],
    tools: [
      {
        name: 'read_file',
        description: 'Read a file',
        input_schema: { type: 'object', properties: { path: { type: 'string' } } },
      },
    ],
    tool_choice: { type: 'any' },
  });

  assert.equal(request.max_output_tokens, 2000);
  assert.equal(request.tools[0].strict, false);
  assert.deepEqual(request.tools[0].parameters, {
    type: 'object',
    properties: { path: { type: 'string' } },
  });
  assert.equal(request.tool_choice, 'required');

  const call = request.input.find((item) => item.type === 'function_call');
  assert.equal(call.call_id, 'call_1');
  assert.equal(call.arguments, '{"path":"package.json"}');

  const output = request.input.find((item) => item.type === 'function_call_output');
  assert.equal(output.call_id, 'call_1');
  assert.equal(output.output, '{"name":"x"}');
});

test('stable mode uses low effort with tools and none without', () => {
  const withTools = toResponsesRequest({
    model: 'm',
    messages: [{ role: 'user', content: 'x' }],
    tools: [{ name: 't', input_schema: { type: 'object' } }],
  });
  const withoutTools = toResponsesRequest({
    model: 'm',
    messages: [{ role: 'user', content: 'x' }],
  });
  assert.deepEqual(withTools.reasoning, { effort: 'low' });
  assert.deepEqual(withoutTools.reasoning, { effort: 'none' });
});

test('full mode keeps a stronger reasoning effort', () => {
  const request = toResponsesRequest(
    {
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      thinking: { type: 'enabled', budget_tokens: 16000 },
    },
    { mode: 'full' },
  );
  assert.deepEqual(request.reasoning, { effort: 'high' });
});

test('fromResponsesJson returns Anthropic text and tool_use blocks', () => {
  const message = fromResponsesJson(
    {
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [
            { type: 'output_text', text: 'Checking ' },
            { type: 'output_text', text: 'now.' },
          ],
        },
        { type: 'function_call', call_id: 'call_9', name: 'ls', arguments: '{"path":"."}' },
      ],
      usage: { input_tokens: 12, output_tokens: 7 },
    },
    { model: 'gpt-5.6-sol' },
  );

  assert.equal(message.content[0].type, 'text');
  assert.equal(message.content[0].text, 'Checking now.');
  assert.equal(message.content[1].type, 'tool_use');
  assert.equal(message.content[1].id, 'call_9');
  assert.deepEqual(message.content[1].input, { path: '.' });
  assert.equal(message.stop_reason, 'tool_use');
  assert.equal(message.usage.input_tokens, 12);
});

test('streaming translator emits text, tool arguments and a tool_use stop reason', () => {
  const chunks = [];
  const res = {
    writableEnded: false,
    write(chunk) {
      chunks.push(chunk);
    },
  };
  const translator = new ResponsesStreamTranslator({ res, model: 'gpt-5.6-sol' });
  translator.begin();

  translator.handle({ type: 'response.output_item.added', item: { type: 'message' } });
  translator.handle({ type: 'response.output_text.delta', delta: 'Hello' });
  translator.handle({ type: 'response.output_item.done', item: { type: 'message' } });
  translator.handle({
    type: 'response.output_item.added',
    item: { type: 'function_call', call_id: 'call_2', name: 'bash' },
  });
  translator.handle({
    type: 'response.function_call_arguments.delta',
    item_id: 'call_2',
    delta: '{"cmd":',
  });
  translator.handle({
    type: 'response.function_call_arguments.delta',
    item_id: 'call_2',
    delta: '"ls"}',
  });
  translator.handle({
    type: 'response.output_item.done',
    item: { type: 'function_call', call_id: 'call_2', name: 'bash', arguments: '{"cmd":"ls"}' },
  });
  translator.finish({ status: 'completed', usage: { input_tokens: 5, output_tokens: 9 } });

  const output = chunks.join('');
  assert.match(output, /event: message_start/);
  assert.match(output, /"type":"text_delta","text":"Hello"/);
  assert.match(output, /"type":"tool_use"/);
  assert.match(output, /"partial_json":"\{\\"cmd\\":"/);
  assert.match(output, /"stop_reason":"tool_use"/);
  assert.match(output, /event: message_stop/);
});

test('streaming translator produces a valid empty text block when nothing arrives', () => {
  const chunks = [];
  const translator = new ResponsesStreamTranslator({
    res: { writableEnded: false, write: (chunk) => chunks.push(chunk) },
    model: 'm',
  });
  translator.begin();
  translator.finish({ status: 'completed', usage: {} });
  const output = chunks.join('');
  assert.match(output, /"content_block":\{"type":"text","text":""\}/);
  assert.match(output, /"stop_reason":"end_turn"/);
});

test('token estimate is positive and grows with content', () => {
  const small = estimateTokens({ messages: [{ role: 'user', content: 'Hi' }] });
  const large = estimateTokens({
    messages: [{ role: 'user', content: 'x'.repeat(4000) }],
  });
  assert.ok(small >= 1);
  assert.ok(large > small);
});
