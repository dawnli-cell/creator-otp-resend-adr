import test from "node:test";
import assert from "node:assert/strict";
import { handleCreatorDeliveryVerification } from "../src/creator_delivery_service.js";

test("resends verification when a ready media job has been stuck for 10+ minutes and reports delivered", async () => {
  const calls: string[] = [];

  const sms = {
    async resend(id: string) {
      calls.push(`resend:${id}`);
      return { message_id: "sms_resend_002" };
    },
    async events(id: string) {
      calls.push(`events:${id}`);
      return [{ status: "delivered" }];
    }
  };

  const input = {
    ingestion: {
      assetId: "asset_100",
      sourceUrl: "https://cdn.example.com/video.mp4",
      creatorPhone: "+15551230000",
      verificationMessageId: "sms_original_001"
    },
    job: {
      jobId: "job_100",
      assetId: "asset_100",
      status: "ready",
      stalledMinutes: 14
    }
  };

  const result = await handleCreatorDeliveryVerification(input, sms);

  assert.deepEqual(result, {
    assetId: "asset_100",
    jobId: "job_100",
    action: "resend_verification_code",
    resentMessageId: "sms_resend_002",
    deliveryState: "delivered"
  });
  assert.deepEqual(calls, ["resend:sms_original_001", "events:sms_resend_002"]);
});
