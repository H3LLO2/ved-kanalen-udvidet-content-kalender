/**
 * Claude Code Runner - Spawns headless Claude Code for AI tasks
 * Replaces Gemini API for Eye, Brain, and Voice agents
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface ClaudeResponse {
  success: boolean;
  result?: string;
  structuredOutput?: unknown;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
  };
}

export interface ClaudeOptions {
  prompt: string;
  systemPrompt?: string;
  jsonSchema?: object;
  model?: 'opus' | 'sonnet' | 'haiku';
  imagePath?: string; // For vision tasks
  timeoutMs?: number;
}

/**
 * Run Claude Code in print mode and return the result
 */
export async function runClaude(options: ClaudeOptions): Promise<ClaudeResponse> {
  const {
    prompt,
    systemPrompt,
    jsonSchema,
    model = 'sonnet',
    imagePath,
    timeoutMs = 120000, // 2 minutes default
  } = options;

  // Build command arguments
  const args: string[] = ['-p', '--output-format', 'json'];

  if (model) {
    args.push('--model', model);
  }

  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt);
  }

  if (jsonSchema) {
    args.push('--json-schema', JSON.stringify(jsonSchema));
  }

  // For vision tasks, prepend image reading instruction
  let finalPrompt = prompt;
  if (imagePath) {
    finalPrompt = `First, read and analyze this image file: ${imagePath}\n\nThen respond to: ${prompt}`;
  }

  args.push(finalPrompt);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' }, // Disable colors for cleaner parsing
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, timeoutMs);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);

      if (timedOut) {
        resolve({ success: false, error: 'Claude Code timed out' });
        return;
      }

      if (code !== 0) {
        resolve({ success: false, error: stderr || `Exit code: ${code}` });
        return;
      }

      try {
        // Clean up terminal escape sequences
        const cleanOutput = stdout.replace(/\x1b\[[0-9;]*[a-zA-Z]|\[\?[0-9;]*[a-zA-Z]|\]9;[^\x07]*\x07?/g, '').trim();
        
        // Find the JSON object in the output
        const jsonMatch = cleanOutput.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          resolve({ success: true, result: cleanOutput });
          return;
        }

        const parsed = JSON.parse(jsonMatch[0]);
        
        resolve({
          success: !parsed.is_error,
          result: parsed.result,
          structuredOutput: parsed.structured_output,
          error: parsed.is_error ? parsed.result : undefined,
          usage: parsed.modelUsage ? {
            inputTokens: Object.values(parsed.modelUsage as Record<string, any>).reduce((sum: number, m: any) => sum + (m.inputTokens || 0), 0),
            outputTokens: Object.values(parsed.modelUsage as Record<string, any>).reduce((sum: number, m: any) => sum + (m.outputTokens || 0), 0),
            costUSD: parsed.total_cost_usd || 0,
          } : undefined,
        });
      } catch (e) {
        // If JSON parsing fails, return raw output
        resolve({ success: true, result: stdout });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Save a base64 image to a temp file for Claude to read
 */
export async function saveImageToTemp(base64Data: string, mimeType: string): Promise<string> {
  const ext = mimeType.includes('png') ? '.png' : mimeType.includes('webp') ? '.webp' : '.jpg';
  const tempPath = path.join(os.tmpdir(), `ved-kanalen-${Date.now()}${ext}`);
  
  // Remove data URL prefix if present
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  
  await fs.writeFile(tempPath, buffer);
  return tempPath;
}

/**
 * Clean up temp image file
 */
export async function cleanupTempImage(tempPath: string): Promise<void> {
  try {
    await fs.unlink(tempPath);
  } catch {
    // Ignore cleanup errors
  }
}
