import type { OnePasswordItemContent } from "./onepassword.ts";
import { oneChatOn } from "./one-chat.ts";

// @1password/sdk 0.5.0 and 0.5.1-beta.1 read a card's built-in expiry as "Unsupported" with no value, so only an
// expiry saved in a custom text field reaches a bot.
const CARD_FIELD_TYPES = new Set(["Text", "Concealed", "CreditCardNumber", "CreditCardType", "MonthYear"]);

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
