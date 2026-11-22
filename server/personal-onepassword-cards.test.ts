import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ONE_CHAT_ENV } from "./one-chat.ts";
import { type OnePasswordItemContent, OnePasswordLogins, sdkOnePasswordClient } from "./onepassword.ts";
import { fillCardExpiry } from "./personal-onepassword-cards.ts";
import { fakeOnePasswordSdk } from "./testing/fake-onepassword.ts";
import { findLinkedSecret, linkedSecrets, readLinkedSecret } from "./vault/providers.ts";

// Obvious fakes only; no network.
const TOKEN = "ops_fake-service-account-token";
const NUMBER = "4111111111111111";
const CVV = "fake-cvv-123";
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
        field("expiry", "expiry date", "MonthYear", "07/2099"),
        field("validFrom", "valid from", "MonthYear", ""),
        field("phoneLocal", "phone (local)", "Phone", "+62 21 000"),
      ] },
      { id: "l1", title: "Shop", urls: ["https://shop.example.com"], username: "alice", password: "fake-shop-pass",
        fields: [field("n1", "card", "CreditCardNumber", LOGIN_CARD)] },
    ] } },
  });
  return new OnePasswordLogins({ token: () => TOKEN, connect: (token) => sdkOnePasswordClient(sdk, token, "test") });
}

const sdkCard = (): OnePasswordItemContent => ({ fields: [
  field("ccnum", "number", "CreditCardNumber", NUMBER),
  field("expiry", "expiry date", "Unsupported", ""),
] });

describe("1Password credit cards", () => {
  const saved = process.env[ONE_CHAT_ENV];
  beforeEach(() => { process.env[ONE_CHAT_ENV] = "1"; });
  afterEach(() => { if (saved === undefined) delete process.env[ONE_CHAT_ENV]; else process.env[ONE_CHAT_ENV] = saved; });

  it("lists a Credit Card item as a secret whose name reads the number and whose fields read the rest", async () => {
    const source = setup();
    await source.refresh();
    expect(linkedSecrets(source, "waffles").map((secret) => [secret.name, secret.fields, secret.bots])).toEqual([
      ["Credit Card", ["cardholder name", "type", "verification number", "expiry date"], "all"],
    ]);
    expect(JSON.stringify(source.items())).not.toContain(NUMBER);
    expect(await readLinkedSecret(findLinkedSecret([source], "Credit Card", "waffles")!)).toBe(NUMBER);
    expect(await readLinkedSecret(findLinkedSecret([source], "Credit Card verification number", "waffles")!)).toBe(CVV);
    expect(await readLinkedSecret(findLinkedSecret([source], "Credit Card expiry date", "waffles")!)).toBe("07/2099");
    expect(source.resolve("op://Bot Agent/Credit Card/number")?.secret.name).toBe("Credit Card");
  });

  it("keeps a Login item's card-type field out of its secrets", async () => {
    const source = setup();
    await source.refresh();
    expect(findLinkedSecret([source], "Shop", "waffles")).toBeNull();
    expect(JSON.stringify(source.items())).not.toContain(LOGIN_CARD);
  });

  it("fills an expiry the SDK returned empty from op, as MM/YYYY, asking op for that field only", async () => {
    const found = new Map([["c1", sdkCard()], ["gone", null]]);
    const asked: string[] = [];
    await fillCardExpiry({ found, vaultId: "v1", token: TOKEN, read: async (reference, token) => { asked.push(`${reference} ${token}`); return "209907"; } });
    expect(asked).toEqual([`op://v1/c1/expiry ${TOKEN}`]);
    expect(found.get("c1")?.fields[1]).toEqual(field("expiry", "expiry date", "MonthYear", "07/2099"));
  });

  it("leaves the expiry empty when op fails or answers something that is not a month", async () => {
    for (const read of [async () => { throw new Error("op: not found"); }, async () => "13/2099"]) {
      const found = new Map([["c1", sdkCard()]]);
      await fillCardExpiry({ found, vaultId: "v1", token: TOKEN, read });
      expect(found.get("c1")?.fields[1]).toEqual(field("expiry", "expiry date", "Unsupported", ""));
    }
  });

  it("skips Credit Card items and never runs op with one chat off, as upstream does", async () => {
    delete process.env[ONE_CHAT_ENV];
    const source = setup();
    await source.refresh();
    expect(linkedSecrets(source, "waffles")).toEqual([]);
    let ran = false;
    await fillCardExpiry({ found: new Map([["c1", sdkCard()]]), vaultId: "v1", token: TOKEN, read: async () => { ran = true; return "209907"; } });
    expect(ran).toBe(false);
  });
});
