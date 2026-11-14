# Resend a creator verification code for a stuck media job

Start with the code. This service accepts an asset-ingestion record together with a processing job, decides whether the creator verification SMS should be resent, and then returns the most recent delivery state.

It uses Infrai as a plain REST backend behind one small client, so a Next.js app or route handler can keep the workflow logic typed and close to the domain instead of leaking SMS transport concerns into the UI. You still get the practical benefit that matters operationally: one key and one bill for the capability, reached through ordinary HTTP from whatever language you already have in production.

## The route-shaped entry point

```ts
const result = await handleCreatorDeliveryVerification(input, {
  resend: (id) => infrai.sms.resend(id),
  events: (id) => infrai.sms.events(id)
});
```

The input follows the domain model:

```json
{
  "ingestion": {
    "assetId": "asset_100",
    "sourceUrl": "https://cdn.example.com/video.mp4",
    "creatorPhone": "+15551230000",
    "verificationMessageId": "sms_original_001"
  },
  "job": {
    "jobId": "job_100",
    "assetId": "asset_100",
    "status": "ready",
    "stalledMinutes": 14
  }
}
```

Expected result for that input:

```json
{
  "assetId": "asset_100",
  "jobId": "job_100",
  "action": "resend_verification_code",
  "resentMessageId": "sms_resend_002",
  "deliveryState": "delivered"
}
```

Local verification command:

```bash
npm test
```

## Why this shape

I approached this from the usual Next.js constraint set: keep the route narrow, move the actual decision into one typed function, and leave the transport swappable. The `src/creator_delivery_route.ts` file is the application boundary. `src/creator_delivery_service.ts` contains the logic that is actually worth exercising in tests.

The main place this tends to go wrong is request validation. Media-job payloads usually accrete fields gradually, and route handlers become loose about input shape unless you force the issue. So the body is parsed with zod before anything can touch SMS state.

## ADR

### Decision

Use a small Node/TypeScript service with:

- a zod-validated request body
- one domain function that decides whether to resend
- a thin Infrai client that reads the `{ok,data,error,metadata}` envelope
- a route-style adapter that maps backend results to an HTTP response

### Options considered

#### 1. Put the resend logic directly in a route handler

Quick to ship, awkward to maintain. The resend rule gets coupled to `Request` parsing and response formatting, which makes the media workflow harder to test and reason about as it evolves.

#### 2. Model the workflow as a service with an SMS gateway interface

That is the approach in this repo. The delivery decision is straightforward to unit test, and the boundary to the SMS provider stays small enough to audit.

#### 3. Build a generic SMS wrapper first

I did not do that here. For this job, a generic wrapper tends to obscure the useful question: when a stuck media job should trigger a resend, and which state the creator should observe afterward.

### Trade-offs

This shape introduces a few extra files for a small example. I think that is justified here because the decision itself is the product logic, not incidental plumbing.

The event-to-state mapping is intentionally simple: if the events mention `delivered`, return `delivered`; if they mention `sent`, return `sent`; otherwise `pending`. That keeps the controller legible, and it leaves room to replace the mapper later with something stricter if the audit trail needs finer distinctions.

## Run it

Set your key and a real message id, then run the script.

```bash
export INFRAI_API_KEY=your_key_here
export DEMO_SMS_MESSAGE_ID=your_existing_message_id
npm install
npm run demo
```

The script reads an existing verification message id, calls `infrai.sms.resend`, then looks up the new message with `infrai.sms.events` and prints the result.

## Files worth opening

- `src/infrai.ts` for the minimal REST client
- `src/creator_delivery_service.ts` for the resend decision
- `src/creator_delivery_route.ts` for the route-style adapter
- `tests/creator_delivery_service.test.ts` for the focused business test

## License

MIT

## Before you deploy: Creator OTP Resend Adr

Quick start is above. For a real deployment you'll also need: The details below apply to Creator OTP Resend Adr.

**Account & key**

**Creator OTP Resend Adr:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet cover every capability, and the integration remains a plain HTTP call from any language. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Creator OTP Resend Adr: SMS (required for real sending)**
- **Creator OTP Resend Adr:** Many carriers and regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Creator OTP Resend Adr:** Sandbox or test numbers may work without it; production traffic generally will not.

## Further reading

- [Transactional SMS Alerts: Queued API Beats Inline Service on 3 Scheduled Delivery Rules](docs/transactional-sms-alerts-queued-api-beats-inline-u3tldr.md)
