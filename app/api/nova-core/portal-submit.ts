// ============================================================
// NOVA Core — Portal Submit API
// POST /api/nova-core/portal-submit
//
// Public endpoint — NO auth required.
// Accepts multipart form with sub proposal PDF + metadata.
// Fires off parse + acknowledgement email, returns immediately.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import Busboy from 'busboy';
import { parseProposalAsync } from '../src/lib/nova-core/parser';
import { sendAcknowledgement } from '../src/lib/nova-core/parserEmail';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

interface ParsedPortalForm {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  company_name: string;
  contact_email: string;
  contact_phone: string;
  project_name: string;
  notes: string;
  gc_id: string;
}

function parseMultipart(req: VercelRequest): Promise<ParsedPortalForm> {
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
        company_name: fields.company_name || '',
        contact_email: fields.contact_email || '',
        contact_phone: fields.contact_phone || '',
        project_name: fields.project_name || '',
        notes: fields.notes || '',
        gc_id: fields.gc_id || '',
      });
    });

    busboy.on('error', (err: Error) => {
      reject(err);
    });

    if (req.body && Buffer.isBuffer(req.body)) {
      busboy.end(req.body);
    } else if (typeof req.body === 'string') {
      busboy.end(Buffer.from(req.body, 'binary'));
    } else {
      (req as any).pipe(busboy);
    }
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ── Rate limiting (rough volume check) ──
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await sb
      .from('parser_audit_log')
      .select('id', { count: 'exact', head: true })
      .like('source_email', '%portal%')
      .gte('created_at', oneHourAgo);

    if (count !== null && count > 10) {
      return res.status(429).json({ error: 'Too many submissions. Please try again later.' });
    }
  } catch {
    // Rate limit check failure shouldn't block submissions
  }

  // ── 1. Parse multipart form data ──
  let form: ParsedPortalForm;
  try {
    form = await parseMultipart(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to parse upload';
    return res.status(400).json({ error: msg });
  }

  // ── 2. Validate fields ──
  if (!form.company_name.trim()) {
    return res.status(400).json({ error: 'Company name is required' });
  }

  if (!form.contact_email.trim()) {
    return res.status(400).json({ error: 'Contact email is required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(form.contact_email.trim())) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (!form.gc_id.trim()) {
    return res.status(400).json({ error: 'Missing organization reference' });
  }

  // Validate PDF
  const isPdf = form.mimeType === 'application/pdf'
    || form.fileName.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    return res.status(400).json({ error: 'Only PDF files are accepted' });
  }

  // Verify org exists
  const { data: org, error: orgErr } = await sb
    .from('organizations')
    .select('id')
    .eq('id', form.gc_id.trim())
    .is('is_active', true)
    .single();

  if (orgErr || !org) {
    return res.status(400).json({ error: 'Invalid organization' });
  }

  const orgId = org.id;

  // ── 3. Convert PDF to base64 ──
  const pdfBase64 = form.fileBuffer.toString('base64');

  // ── 4. Compute SHA-256 input hash ──
  const inputHash = createHash('sha256').update(pdfBase64).digest('hex');

  try {
    // ── 5. Duplicate check (48h window) ──
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await sb
      .from('parser_audit_log')
      .select('id')
      .eq('input_hash', inputHash)
      .gte('created_at', fortyEightHoursAgo)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(200).json({ duplicate: true });
    }

    // ── 6. Insert parser_audit_log ──
    const sourceEmail = `${form.contact_email.trim()} (portal)`;

    const { data: parseJob, error: insertErr } = await sb
      .from('parser_audit_log')
      .insert({
        org_id: orgId,
        input_hash: inputHash,
        source_email: sourceEmail,
        sub_company_name: form.company_name.trim(),
        model_used: 'claude-sonnet-4-20250514',
        total_lines_parsed: 0,
        high_confidence: 0,
        mid_confidence: 0,
        low_confidence: 0,
        auto_written: 0,
      })
      .select('id')
      .single();

    if (insertErr || !parseJob) {
      console.error('[portal-submit] Failed to create audit log:', insertErr?.message);
      return res.status(500).json({ error: 'Failed to record submission' });
    }

    const parseJobId = parseJob.id;

    // ── 7. Fire and forget: parse + acknowledgement ──
    parseProposalAsync(pdfBase64, sourceEmail, orgId, parseJobId).catch(err => {
      console.error('[portal-submit] Background parse error:', err instanceof Error ? err.message : err);
    });

    sendAcknowledgement(form.contact_email.trim(), 'Proposal Submission', parseJobId).catch(err => {
      console.error('[portal-submit] Acknowledgement email error:', err instanceof Error ? err.message : err);
    });

    // ── 8. Return immediately ──
    return res.status(200).json({ received: true });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[portal-submit]', message);
    return res.status(500).json({ error: 'Submission failed. Please try again.' });
  }
}

// Vercel: disable body parsing so we can handle multipart with busboy
export const config = {
  api: {
    bodyParser: false,
  },
};
