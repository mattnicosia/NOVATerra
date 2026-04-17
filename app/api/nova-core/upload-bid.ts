// ============================================================
// NOVA Core — Upload Bid API
// POST /api/nova-core/upload-bid
//
// Multipart PDF upload → parse → return results synchronously.
// Unlike parse-bid.ts (Postmark webhook), this waits for the
// parse to complete before returning.
//
// Auth: nova_admin_token cookie.
// Uses NOVA_CORE_SERVICE_ROLE_KEY for all Supabase writes.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import Busboy from 'busboy';
import { parseProposalAsync } from '../src/lib/nova-core/parser';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DEFAULT_ORG_ID = '0eb6aec0-2f8b-4061-ad75-0b1c9ff09ef1';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(part => {
    const [key, ...rest] = part.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}

interface ParsedForm {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  sub_company_name: string;
  project_reference: string;
  trade: string;
}

function parseMultipart(req: VercelRequest): Promise<ParsedForm> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    let fileBuffer: Buffer | null = null;
    let fileName = '';
    let mimeType = '';

    const busboy = Busboy({
      headers: req.headers as Record<string, string>,
      limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    });

    busboy.on('file', (_fieldname: string, stream: NodeJS.ReadableStream, info: { filename: string; mimeType: string }) => {
      fileName = info.filename || '';
      mimeType = info.mimeType || '';
      const chunks: Buffer[] = [];

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });

      stream.on('limit', () => {
        reject(new Error(`File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)} MB`));
      });
    });

    busboy.on('field', (name: string, value: string) => {
      fields[name] = value;
    });

    busboy.on('finish', () => {
      if (!fileBuffer) {
        reject(new Error('No file uploaded'));
        return;
      }
      resolve({
        fileBuffer,
        fileName,
        mimeType,
        sub_company_name: fields.sub_company_name || '',
        project_reference: fields.project_reference || '',
        trade: fields.trade || '',
      });
    });

    busboy.on('error', (err: Error) => {
      reject(err);
    });

    // Pipe request to busboy
    if (req.body && Buffer.isBuffer(req.body)) {
      busboy.end(req.body);
    } else if (typeof req.body === 'string') {
      busboy.end(Buffer.from(req.body, 'binary'));
    } else {
      // Stream mode
      (req as any).pipe(busboy);
    }
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth check ──
  const cookie = parseCookies((req.headers.cookie as string) || '');
  const ADMIN_SECRET = process.env.NOVA_ADMIN_SECRET;
  if (!ADMIN_SECRET || cookie.nova_admin_token !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing NOVA Core credentials' });
  }

  // ── 1. Parse multipart form data ──
  let form: ParsedForm;
  try {
    form = await parseMultipart(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to parse upload';
    return res.status(400).json({ error: msg });
  }

  // Validate PDF
  const isPdf = form.mimeType === 'application/pdf'
    || form.fileName.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    return res.status(400).json({ error: 'Only PDF files are accepted' });
  }

  if (form.fileBuffer.length > MAX_FILE_SIZE) {
    return res.status(400).json({ error: `File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)} MB` });
  }

  // ── 2. Convert to base64 ──
  const pdfBase64 = form.fileBuffer.toString('base64');

  // ── 3. Compute input hash ──
  const inputHash = createHash('sha256').update(pdfBase64).digest('hex');

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const orgId = DEFAULT_ORG_ID;

  try {
    // ── 4. Duplicate check (48h window) ──
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await sb
      .from('parser_audit_log')
      .select('id')
      .eq('input_hash', inputHash)
      .gte('created_at', fortyEightHoursAgo)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(200).json({
        duplicate: true,
        message: 'This proposal was already uploaded recently',
      });
    }

    // ── 5. Create parser_audit_log entry ──
    const sourceEmail = form.sub_company_name
      ? `${form.sub_company_name} (upload)`
      : 'Manual Upload';

    const { data: parseJob, error: insertErr } = await sb
      .from('parser_audit_log')
      .insert({
        org_id: orgId,
        input_hash: inputHash,
        source_email: sourceEmail,
        sub_company_name: form.sub_company_name || null,
        model_used: 'claude-sonnet-4-6',
        total_lines_parsed: 0,
        high_confidence: 0,
        mid_confidence: 0,
        low_confidence: 0,
        auto_written: 0,
      })
      .select('id')
      .single();

    if (insertErr || !parseJob) {
      console.error('[upload-bid] Failed to create audit log:', insertErr?.message);
      return res.status(500).json({ error: 'Failed to create parse job' });
    }

    const parseJobId = parseJob.id;

    // ── 6. AWAIT parse (synchronous — wait for completion) ──
    // Timeout: 120s via Vercel function max duration
    await parseProposalAsync(pdfBase64, sourceEmail, orgId, parseJobId);

    // ── 7. Fetch updated audit log row ──
    const { data: updatedJob } = await sb
      .from('parser_audit_log')
      .select('high_confidence, mid_confidence, low_confidence, auto_written, total_bid_amount, sub_company_name, error_message')
      .eq('id', parseJobId)
      .single();

    if (updatedJob?.error_message) {
      return res.status(500).json({
        error: 'Parse completed with errors',
        detail: updatedJob.error_message,
        jobId: parseJobId,
      });
    }

    // ── 8. Return results ──
    const autoWritten = updatedJob?.auto_written || 0;
    const midConf = updatedJob?.mid_confidence || 0;
    const lowConf = updatedJob?.low_confidence || 0;

    return res.status(200).json({
      jobId: parseJobId,
      autoWritten,
      queued: midConf + lowConf,
      manualReview: lowConf,
      totalBidAmount: updatedJob?.total_bid_amount || null,
      subCompanyName: updatedJob?.sub_company_name || form.sub_company_name || null,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[upload-bid]', message);
    return res.status(500).json({ error: 'Parse failed: ' + message });
  }
}

// Vercel: disable body parsing so we can handle multipart with busboy
export const config = {
  api: {
    bodyParser: false,
  },
};
