// Generates URL-safe slugs for living proposals
// Uses crypto.randomBytes for secure randomness
// Alphabet excludes ambiguous chars (0/O, 1/l/I)

import crypto from "crypto";

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const SLUG_LENGTH = 10;
const TOKEN_LENGTH = 32;

function generate(length, alphabet) {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

/** Short URL slug — 10 chars, URL-safe, no ambiguous chars */
export function generateSlug() {
  return generate(SLUG_LENGTH, ALPHABET);
}

/** Longer access token for write operations — 32 chars */
export function generateAccessToken() {
  return generate(TOKEN_LENGTH, ALPHABET + 'ABCDEFGHJKMNPQRSTUVWXYZ');
}
