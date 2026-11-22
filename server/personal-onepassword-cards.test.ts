import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ONE_CHAT_ENV } from "./one-chat.ts";
import { OnePasswordLogins, sdkOnePasswordClient } from "./onepassword.ts";
import { fakeOnePasswordSdk } from "./testing/fake-onepassword.ts";
import { findLinkedSecret, linkedSecrets, readLinkedSecret } from "./vault/providers.ts";

// Obvious fakes only; no network.
const TOKEN = "ops_fake-service-account-token";
const NUMBER = "4111111111111111";
const CVV = "fake-cvv-123";
const EXPIRY = "07/2099";
const LOGIN_CARD = "fake-login-card-number";

const field = (id: string, title: string, fieldType: string, value: string) => ({ id, title, fieldType, value });

function setup() {
  const { sdk } = fakeOnePasswordSdk({
    token: TOKEN,
    vaults: { v1: { title: "Bot Agent", items: [
      { id: "c1", title: "Credit Card", category: "CreditCard", urls: [], fields: [
        field("cardholder", "cardholder name", "Text", "Fake Holder"),
        field("type", "type", "CreditCardType", "visa"),
        field("ccnum", "number", "CreditCardNumber", NUMBER),
        field("cvv", "verification number", "Concealed", CVV),
        field("expiry", "expiry date", "Unsupported", ""),
        field("validFrom", "valid from", "MonthYear", ""),
        field("phoneLocal", "phone (local)", "Phone", "+62 21 000"),
        field("custom1", "expiry", "Text", EXPIRY),
      ] },
      { id: "l1", title: "Shop", urls: ["https://shop.example.com"], username: "alice", password: "fake-shop-pass",
        fields: [field("n1", "card", "CreditCardNumber", LOGIN_CARD)] },
    ] } },
  });
  return new OnePasswordLogins({ token: () => TOKEN, connect: (token) => sdkOnePasswordClient(sdk, token, "test") });
}

describe("1Password credit cards", () => {
  const saved = process.env[ONE_CHAT_ENV];
  beforeEach(() => { process.env[ONE_CHAT_ENV] = "1"; });
  afterEach(() => { if (saved === undefined) delete process.env[ONE_CHAT_ENV]; else process.env[ONE_CHAT_ENV] = saved; });

  it("lists a Credit Card item as a secret whose name reads the number and whose fields read the rest", async () => {
    const source = setup();
    await source.refresh();
    expect(linkedSecrets(source, "waffles").map((secret) => [secret.name, secret.fields, secret.bots])).toEqual([
      ["Credit Card", ["cardholder name", "type", "verification number", "expiry"], "all"],
    ]);
    expect(JSON.stringify(source.items())).not.toContain(NUMBER);
    expect(await readLinkedSecret(findLinkedSecret([source], "Credit Card", "waffles")!)).toBe(NUMBER);
    expect(await readLinkedSecret(findLinkedSecret([source], "Credit Card verification number", "waffles")!)).toBe(CVV);
    expect(await readLinkedSecret(findLinkedSecret([source], "Credit Card expiry", "waffles")!)).toBe(EXPIRY);
    expect(source.resolve("op://Bot Agent/Credit Card/number")?.secret.name).toBe("Credit Card");
  });

  it("keeps a Login item's card-type field out of its secrets", async () => {
    const source = setup();
    await source.refresh();
    expect(findLinkedSecret([source], "Shop", "waffles")).toBeNull();
    expect(JSON.stringify(source.items())).not.toContain(LOGIN_CARD);
  });

  it("skips Credit Card items with one chat off, as upstream does", async () => {
    delete process.env[ONE_CHAT_ENV];
    const source = setup();
    await source.refresh();
    expect(linkedSecrets(source, "waffles")).toEqual([]);
  });
});
