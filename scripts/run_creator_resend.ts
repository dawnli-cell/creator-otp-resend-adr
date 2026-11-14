import { infrai } from "../src/infrai.js";
import { handleCreatorDeliveryVerification } from "../src/creator_delivery_service.js";

const input = {
  ingestion: {
    assetId: "asset_4921",
    sourceUrl: "https://cdn.example.com/uploads/episode-12.mov",
    creatorPhone: process.env.DEMO_CREATOR_PHONE || (() => {
      throw new Error("DEMO_CREATOR_PHONE is required");
    })(),
    verificationMessageId: process.env.DEMO_SMS_MESSAGE_ID || "sms_message_id_here"
  },
  job: {
    jobId: "job_4921_transcode",
    assetId: "asset_4921",
    status: "ready",
    stalledMinutes: 18
  }
};

const result = await handleCreatorDeliveryVerification(input, {
  resend: (id: string) => infrai.sms.resend(id),
  events: (id: string) => infrai.sms.events(id)
});

console.log(JSON.stringify(result, null, 2));
