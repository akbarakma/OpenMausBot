import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { OnePasswordItemContent } from "./onepassword.ts";
import { oneChatOn } from "./one-chat.ts";

const CARD_FIELD_TYPES = new Set(["Text", "Concealed", "CreditCardNumber", "CreditCardType", "MonthYear"]);
const OP_TIMEOUT_MS = 15_000;

/** Whether a 1Password item of this category reaches bots as a card secret, which upstream skips. */
export const readsCards = (category: string): boolean => category === "CreditCard" && oneChatOn();

const cardNumber = (content: OnePasswordItemContent) => content.fields.find((field) => field.id === "ccnum" && field.value);

/** A Credit Card item's values by field title, with "" for its number. */
export function cardFields(content: OnePasswordItemContent): Map<string, string> {
  const values = new Map<string, string>();
  const number = cardNumber(content);
  if (number) values.set("", number.value);
  for (const field of content.fields) {
    const title = field.title.trim();
    if (field !== number && field.value && title && CARD_FIELD_TYPES.has(field.fieldType) && !values.has(title)) values.set(title, field.value);
  }
  return values;
}

export const cardMainTitle = (content: OnePasswordItemContent): string | undefined => cardNumber(content)?.title.trim() || undefined;

export type ReadOp = (reference: string, token: string) => Promise<string>;

// Security: the token goes to op through its environment, never its arguments, which other processes can read.
const readOp: ReadOp = async (reference, token) =>
  (await promisify(execFile)("op", ["read", reference], { env: { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: token }, timeout: OP_TIMEOUT_MS })).stdout.trim();

/**
 * Fills each card expiry the SDK returned empty with the op CLI's reading of it, as MM/YYYY: @1password/sdk 0.5.0 and
 * 0.5.1-beta.1 return a card's built-in expiry as "Unsupported" with no value, while op 2.x reads it as YYYYMM.
 */
export async function fillCardExpiry({ found, vaultId, token, read = readOp }: {
  found: Map<string, OnePasswordItemContent | null>; vaultId: string; token: string; read?: ReadOp;
}): Promise<void> {
  if (!oneChatOn()) return;
  for (const [itemId, content] of found) {
    const expiry = content?.fields.find((field) => field.id === "expiry" && field.fieldType === "Unsupported" && !field.value);
    if (!expiry) continue;
    try {
      const month = /^(\d{4})(0[1-9]|1[0-2])$/u.exec(await read(`op://${vaultId}/${itemId}/expiry`, token));
      if (month) Object.assign(expiry, { fieldType: "MonthYear", value: `${month[2]}/${month[1]}` });
    } catch (error) {
      console.warn(`1Password: op did not read a card expiry: ${(error instanceof Error ? error.message : String(error)).split("\n", 1)[0]}`);
    }
  }
}
